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
)

// Proposal is an immutable Web Request create proposal once staged.
type Proposal struct {
	Name, BaseURL, CredentialLabel string
	Credential                     string `json:"-"`
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
	if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.BaseURL) == "" ||
		(in.Credential != "" && strings.TrimSpace(in.CredentialLabel) == "") ||
		(in.Credential == "" && in.CredentialLabel != "") {
		return "", ErrInvalidProposal
	}
	var encrypted []byte
	if in.Credential != "" {
		var err error
		encrypted, err = s.box.Encrypt([]byte(in.Credential))
		if err != nil {
			return "", err
		}
	}
	return s.queries.StageAttempt(ctx, jobsdb.StageAttemptParams{
		Name: in.Name, BaseUrl: in.BaseURL, CredentialLabel: in.CredentialLabel,
		CandidateCiphertext: encrypted, TtlSeconds: AttemptTTL.Seconds(),
	})
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
			BaseURL: row.BaseUrl, CredentialLabel: row.CredentialLabel,
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
func (s *Store) Complete(ctx context.Context, id, token string, httpStatus int, latency time.Duration) error {
	if httpStatus < 200 || httpStatus >= 300 || latency < 0 {
		return ErrInvalidFinding
	}
	status := int16(httpStatus)
	return pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.queries.WithTx(tx)
		proposal, err := q.LockClaim(ctx, jobsdb.LockClaimParams{ID: id, Token: token, LeaseSeconds: LeaseDuration.Seconds()})
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrClaimLost
		}
		if err != nil {
			return err
		}
		connectorID, err := q.CreateConnector(ctx, jobsdb.CreateConnectorParams{Name: proposal.Name, BaseUrl: proposal.BaseUrl})
		if err != nil {
			return err
		}
		if proposal.CandidateCiphertext != nil {
			n, err := q.SetInitialCredential(ctx, jobsdb.SetInitialCredentialParams{
				ConnectorID: connectorID, Label: proposal.CredentialLabel, Ciphertext: proposal.CandidateCiphertext,
			})
			if err != nil {
				return err
			}
			if n != 1 {
				return errors.New("initial Credential was not attached to one Connector")
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
