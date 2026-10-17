// Package jobs owns checked-Save persistence and claim fencing.
package jobs

import (
	"context"
	"errors"
	"strings"
	"time"

	jobsdb "github.com/BasuruK/goldfin/internal/jobs/db"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AttemptTTL bounds how long an uncommitted proposal may retain a Credential.
const AttemptTTL = 15 * time.Minute

// LeaseDuration exceeds the worker's check budget and bounds crash recovery.
const LeaseDuration = 2 * time.Minute

// MaxClaimAttempts prevents a crashing proposal from being retried forever.
const MaxClaimAttempts = 5

var (
	ErrInvalidProposal = errors.New("invalid Connector Save proposal")
	ErrNotFound        = errors.New("Connector Save attempt not found")
	ErrNoWork          = errors.New("no pending Connector Save attempt")
	ErrClaimLost       = errors.New("Connector Save claim no longer held")
	ErrInvalidFinding  = errors.New("invalid Reachable finding")
	// ErrStale reports an edit whose base revision no longer matches the active Connector.
	ErrStale = errors.New("Connector changed since the edit was proposed")
)

// Proposal is an immutable Web Request create proposal once staged.
type Proposal struct {
	Name, BaseURL, CredentialLabel string
	Credential                     string `json:"-"`
}

// EditProposal is an immutable edit of one active Connector once staged. An empty
// Credential keeps the active generation; a supplied one requires a label and replaces it.
type EditProposal struct {
	ConnectorID, Name, BaseURL, CredentialLabel string
	BaseRevision                                int64
	Credential                                  string `json:"-"`
}

// Attempt exposes safe polling metadata, never ciphertext or a claim token.
type Attempt struct {
	ID, State, ConnectorID, FindingKind, FailureCode string
	HTTPStatus                                       int16
	LatencyMS                                        int64
}

// Connector contains active metadata, with no value-derived Credential details.
type Connector struct {
	ID, Name, ProviderType, BaseURL, CredentialLabel string
	Revision                                         int64
	CredentialSetAt                                  *time.Time
}

// Claim is worker-only input. Its authority and encrypted value are never serialized.
type Claim struct {
	ID, Name, BaseURL, CredentialLabel string
	Attempts                           int32
	Token                              string `json:"-"`
	Ciphertext                         []byte `json:"-"`
}

// Store shares a caller-owned pool. Construct it with NewStore.
type Store struct {
	pool    *pgxpool.Pool
	queries *jobsdb.Queries
	box     *secretbox.Box
}

// NewStore validates the encryption key; it does not take ownership of the pool.
func NewStore(pool *pgxpool.Pool, key []byte) (*Store, error) {
	box, err := secretbox.New(key)
	if err != nil {
		return nil, err
	}
	return &Store{pool: pool, queries: jobsdb.New(pool), box: box}, nil
}

// Stage writes only an encrypted proposal and returns its polling handle.
func (s *Store) Stage(ctx context.Context, in Proposal) (string, error) {
	encrypted, err := s.seal(in.Name, in.BaseURL, in.CredentialLabel, in.Credential)
	if err != nil {
		return "", err
	}
	return s.queries.StageAttempt(ctx, jobsdb.StageAttemptParams{
		Name: in.Name, BaseUrl: in.BaseURL, CredentialLabel: in.CredentialLabel,
		CandidateCiphertext: encrypted, TtlSeconds: AttemptTTL.Seconds(),
	})
}

// StageEdit writes only an encrypted edit proposal for an existing Connector. Changing the
// base URL requires a replacement Credential, so an active one is never sent to a new host.
func (s *Store) StageEdit(ctx context.Context, in EditProposal) (string, error) {
	encrypted, err := s.seal(in.Name, in.BaseURL, in.CredentialLabel, in.Credential)
	if err != nil {
		return "", err
	}
	id, err := s.queries.StageEditAttempt(ctx, jobsdb.StageEditAttemptParams{
		ConnectorID: in.ConnectorID, BaseRevision: in.BaseRevision, Name: in.Name, BaseUrl: in.BaseURL,
		CredentialLabel: in.CredentialLabel, CandidateCiphertext: encrypted, TtlSeconds: AttemptTTL.Seconds(),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		// The insert matches no row for a missing Connector, or for a new URL that would reuse the active Credential.
		exists, existsErr := s.queries.ConnectorExists(ctx, in.ConnectorID)
		if existsErr != nil {
			return "", existsErr
		}
		if exists {
			return "", ErrInvalidProposal
		}
		return "", ErrNotFound
	}
	return id, err
}

// seal validates a proposal and encrypts its optional Credential candidate.
func (s *Store) seal(name, baseURL, label, credential string) ([]byte, error) {
	if strings.TrimSpace(name) == "" || strings.TrimSpace(baseURL) == "" ||
		(credential != "" && strings.TrimSpace(label) == "") || (credential == "" && label != "") {
		return nil, ErrInvalidProposal
	}
	if credential == "" {
		return nil, nil
	}
	return s.box.Encrypt([]byte(credential))
}

// Get reads the public state of a Save attempt.
func (s *Store) Get(ctx context.Context, id string) (Attempt, error) {
	row, err := s.queries.GetAttempt(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Attempt{}, ErrNotFound
	}
	if err != nil {
		return Attempt{}, err
	}
	return Attempt{
		ID: row.ID, State: row.State, ConnectorID: row.ConnectorID, FindingKind: row.FindingKind,
		HTTPStatus: row.HttpStatus, LatencyMS: row.LatencyMs, FailureCode: row.FailureCode,
	}, nil
}

// ListConnectors reads committed metadata only.
func (s *Store) ListConnectors(ctx context.Context) ([]Connector, error) {
	rows, err := s.queries.ListConnectors(ctx)
	if err != nil {
		return nil, err
	}
	connectors := make([]Connector, 0, len(rows))
	for _, row := range rows {
		connector := Connector{
			ID: row.ID, Name: row.Name, ProviderType: row.ProviderType,
			BaseURL: row.BaseUrl, CredentialLabel: row.CredentialLabel, Revision: row.Revision,
		}
		if row.CredentialSetAt.Valid {
			setAt := row.CredentialSetAt.Time
			connector.CredentialSetAt = &setAt
		}
		connectors = append(connectors, connector)
	}
	return connectors, nil
}

// ClaimNext clears terminal candidates and assigns queued or stale work with a fresh token.
func (s *Store) ClaimNext(ctx context.Context) (Claim, error) {
	var row jobsdb.ClaimNextRow
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		if err := q.ExpireAttempts(ctx, jobsdb.ExpireAttemptsParams{MaxClaims: MaxClaimAttempts, LeaseSeconds: LeaseDuration.Seconds()}); err != nil {
			return err
		}
		claimed, err := q.ClaimNext(ctx, jobsdb.ClaimNextParams{MaxClaims: MaxClaimAttempts, LeaseSeconds: LeaseDuration.Seconds()})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // Commit candidate cleanup even when the queue is empty.
		}
		row = claimed
		return err
	})
	if err != nil {
		return Claim{}, err
	}
	if row.ID == "" {
		return Claim{}, ErrNoWork
	}
	return Claim{
		ID: row.ID, Name: row.Name, BaseURL: row.BaseUrl, CredentialLabel: row.CredentialLabel,
		Token: row.ClaimToken, Ciphertext: row.CandidateCiphertext, Attempts: row.ClaimAttempts,
	}, nil
}

// Complete commits only the original proposal held by a current, unexpired claim.
// An edit whose base revision is no longer current finishes as stale and returns ErrStale.
func (s *Store) Complete(ctx context.Context, id, token string, httpStatus int, latency time.Duration) error {
	if httpStatus < 200 || httpStatus >= 300 || latency < 0 {
		return ErrInvalidFinding
	}
	status := int16(httpStatus)
	stale := false
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		proposal, err := q.LockClaim(ctx, jobsdb.LockClaimParams{ID: id, Token: token, LeaseSeconds: LeaseDuration.Seconds()})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrClaimLost
		}
		if err != nil {
			return err
		}
		connectorID := proposal.TargetConnectorID
		if connectorID == "" {
			connectorID, err = q.CreateConnector(ctx, jobsdb.CreateConnectorParams{Name: proposal.Name, BaseUrl: proposal.BaseUrl})
			if err != nil {
				return err
			}
			if proposal.CandidateCiphertext != nil {
				if err := s.attachCredential(ctx, q, connectorID, proposal.CredentialLabel, proposal.CandidateCiphertext); err != nil {
					return err
				}
			}
		} else {
			n, err := q.ApplyConnectorEdit(ctx, jobsdb.ApplyConnectorEditParams{
				ID: connectorID, BaseRevision: proposal.BaseRevision, Name: proposal.Name, BaseUrl: proposal.BaseUrl,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				stale = true
				return s.finishStale(ctx, q, id, token)
			}
			if proposal.CandidateCiphertext != nil {
				if err := q.SupersedeActiveCredential(ctx, connectorID); err != nil {
					return err
				}
				if err := s.attachCredential(ctx, q, connectorID, proposal.CredentialLabel, proposal.CandidateCiphertext); err != nil {
					return err
				}
			}
		}
		n, err := q.FinishSuccess(ctx, jobsdb.FinishSuccessParams{
			ID: id, Token: token, ConnectorID: connectorID, HttpStatus: status,
			LatencyMs: latency.Milliseconds(), LeaseSeconds: LeaseDuration.Seconds(),
		})
		if err != nil {
			return err
		}
		if n != 1 {
			return ErrClaimLost
		}
		return nil
	})
	if err == nil && stale {
		return ErrStale
	}
	return err
}

// attachCredential appends an active generation and points its Connector at it.
func (s *Store) attachCredential(ctx context.Context, q *jobsdb.Queries, connectorID, label string, ciphertext []byte) error {
	n, err := q.AttachCredential(ctx, jobsdb.AttachCredentialParams{ConnectorID: connectorID, Label: label, Ciphertext: ciphertext})
	if err != nil {
		return err
	}
	if n != 1 {
		return errors.New("generation was not attached to one Connector")
	}
	return nil
}

// finishStale terminalizes the held attempt so its candidate cannot be reused.
func (s *Store) finishStale(ctx context.Context, q *jobsdb.Queries, id, token string) error {
	n, err := q.FinishFailure(ctx, jobsdb.FinishFailureParams{
		ID: id, Token: token, FailureCode: "stale", LeaseSeconds: LeaseDuration.Seconds(),
	})
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrClaimLost
	}
	return nil
}

// Fail clears a held candidate without creating active data or storing raw errors.
func (s *Store) Fail(ctx context.Context, id, token, code string) error {
	if code != "unreachable" && code != "timeout" {
		return errors.New("invalid Connector check failure code")
	}
	n, err := s.queries.FinishFailure(ctx, jobsdb.FinishFailureParams{
		ID: id, Token: token, FailureCode: code, LeaseSeconds: LeaseDuration.Seconds(),
	})
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrClaimLost
	}
	return nil
}

// Release requeues a held proposal during worker shutdown without changing its input.
func (s *Store) Release(ctx context.Context, id, token string) error {
	n, err := s.queries.ReleaseClaim(ctx, jobsdb.ReleaseClaimParams{
		ID: id, Token: token, LeaseSeconds: LeaseDuration.Seconds(),
	})
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrClaimLost
	}
	return nil
}
