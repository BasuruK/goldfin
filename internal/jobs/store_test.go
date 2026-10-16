package jobs_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/testdb"
	"github.com/jackc/pgx/v5/pgxpool"
)

func newTestStore(t *testing.T) (*jobs.Store, *pgxpool.Pool) {
	t.Helper()
	pool, db := testdb.New(t)
	provider, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	store, err := jobs.NewStore(pool, bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return store, pool
}

func TestStageEncryptsWithoutCreatingActiveData(t *testing.T) {
	store, pool := newTestStore(t)
	proposal := jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com/check", Credential: rand.Text()}
	if _, err := store.Stage(t.Context(), proposal); err == nil {
		t.Fatal("Credential accepted without its label")
	}
	proposal.CredentialLabel = "Fixture label"
	id, err := store.Stage(t.Context(), proposal)
	if err != nil {
		t.Fatal(err)
	}
	attempt, err := store.Get(t.Context(), id)
	if err != nil || attempt.State != "queued" || attempt.ConnectorID != "" {
		t.Fatalf("staged attempt: %+v, %v", attempt, err)
	}
	connectors, err := store.ListConnectors(t.Context())
	if err != nil || len(connectors) != 0 {
		t.Fatalf("staging created active data: %+v, %v", connectors, err)
	}
	var encrypted []byte
	if err := pool.QueryRow(t.Context(), "SELECT candidate_ciphertext FROM connector_save_attempts WHERE id = $1", id).Scan(&encrypted); err != nil {
		t.Fatal(err)
	}
	box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	plain, err := box.Decrypt(encrypted)
	if err != nil || string(plain) != proposal.Credential || bytes.Contains(encrypted, []byte(proposal.Credential)) {
		t.Fatal("candidate was not encrypted at rest")
	}
	safe, err := json.Marshal(attempt)
	if err != nil || bytes.Contains(safe, []byte(proposal.Credential)) || bytes.Contains(safe, []byte("ciphertext")) || bytes.Contains(safe, []byte("ClaimToken")) {
		t.Fatal("attempt read exposed Credential/claim internals")
	}
}

func TestSuccessfulClaimCommitsOriginalProposalAtomically(t *testing.T) {
	for _, tc := range []struct{ name, credential string }{{"no Credential", ""}, {"Credential", "fixture-Credential-plaintext"}} {
		t.Run(tc.name, func(t *testing.T) {
			credential := tc.credential
			store, pool := newTestStore(t)
			proposal := jobs.Proposal{Name: "Original", BaseURL: "https://example.com/check", Credential: credential}
			if credential != "" {
				proposal.CredentialLabel = "Fixture label"
			}
			id, err := store.Stage(t.Context(), proposal)
			if err != nil {
				t.Fatal(err)
			}
			claim, err := store.ClaimNext(t.Context())
			if err != nil || claim.ID != id || claim.Token == "" || claim.Attempts != 1 || claim.BaseURL != proposal.BaseURL {
				t.Fatalf("claim: %+v, %v", claim, err)
			}
			if err := store.Complete(t.Context(), id, claim.Token, 503, time.Millisecond); err == nil {
				t.Fatal("non-2xx finding accepted")
			}
			if err := store.Complete(t.Context(), id, claim.Token, 204, 12*time.Millisecond); err != nil {
				t.Fatal(err)
			}
			attempt, err := store.Get(t.Context(), id)
			if err != nil || attempt.State != "finished" || attempt.FindingKind != "reachable" || attempt.HTTPStatus != 204 || attempt.LatencyMS != 12 || attempt.ConnectorID == "" {
				t.Fatalf("completion: %+v, %v", attempt, err)
			}
			connectors, err := store.ListConnectors(t.Context())
			if err != nil || len(connectors) != 1 || connectors[0].ID != attempt.ConnectorID || connectors[0].Name != proposal.Name || connectors[0].BaseURL != proposal.BaseURL || connectors[0].ProviderType != "web_request" || connectors[0].CredentialLabel != proposal.CredentialLabel {
				t.Fatalf("active metadata: %+v, %v", connectors, err)
			}
			if (connectors[0].CredentialSetAt != nil) != (credential != "") {
				t.Fatal("optional Credential timestamp is incorrect")
			}
			if credential != "" {
				var encrypted []byte
				if err := pool.QueryRow(t.Context(), "SELECT ciphertext FROM credential_generations WHERE connector_id = $1", attempt.ConnectorID).Scan(&encrypted); err != nil {
					t.Fatal(err)
				}
				box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
				if err != nil {
					t.Fatal(err)
				}
				plain, err := box.Decrypt(encrypted)
				if err != nil || string(plain) != credential {
					t.Fatal("initial generation does not contain the encrypted proposal")
				}
			}
			var retained bool
			if err := pool.QueryRow(t.Context(), "SELECT candidate_ciphertext IS NOT NULL FROM connector_save_attempts WHERE id = $1", id).Scan(&retained); err != nil || retained {
				t.Fatalf("candidate retained after commit: %v", err)
			}
			if err := store.Complete(t.Context(), id, claim.Token, 204, time.Millisecond); !errors.Is(err, jobs.ErrClaimLost) {
				t.Fatalf("duplicate completion: %v", err)
			}
		})
	}
}

func TestFailedClaimClearsCandidateAndCreatesNoConnector(t *testing.T) {
	for _, code := range []string{"unreachable", "timeout"} {
		t.Run(code, func(t *testing.T) {
			store, pool := newTestStore(t)
			id, err := store.Stage(t.Context(), jobs.Proposal{
				Name: "Fixture", BaseURL: "https://example.com", Credential: rand.Text(), CredentialLabel: "Fixture label",
			})
			if err != nil {
				t.Fatal(err)
			}
			claim, err := store.ClaimNext(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			if err := store.Fail(t.Context(), id, claim.Token, "raw-provider-exception"); err == nil {
				t.Fatal("unsafe failure code accepted")
			}
			if err := store.Fail(t.Context(), id, claim.Token, code); err != nil {
				t.Fatal(err)
			}
			attempt, err := store.Get(t.Context(), id)
			if err != nil || attempt.State != "finished" || attempt.FailureCode != code || attempt.ConnectorID != "" || attempt.FindingKind != "" {
				t.Fatalf("failed attempt: %+v, %v", attempt, err)
			}
			connectors, err := store.ListConnectors(t.Context())
			if err != nil || len(connectors) != 0 {
				t.Fatal("failed create became active")
			}
			var cleared bool
			if err := pool.QueryRow(t.Context(), "SELECT candidate_ciphertext IS NULL FROM connector_save_attempts WHERE id = $1", id).Scan(&cleared); err != nil || !cleared {
				t.Fatal("failed candidate retained ciphertext")
			}
			if err := store.Complete(t.Context(), id, claim.Token, 200, time.Millisecond); !errors.Is(err, jobs.ErrClaimLost) {
				t.Fatalf("late completion: %v", err)
			}
			if err := store.Fail(t.Context(), id, claim.Token, code); !errors.Is(err, jobs.ErrClaimLost) {
				t.Fatalf("duplicate failure: %v", err)
			}
		})
	}
}

func TestShutdownReleaseRequeuesAndFencesTheOldWorker(t *testing.T) {
	store, _ := newTestStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com", Credential: rand.Text(), CredentialLabel: "Fixture label"})
	if err != nil {
		t.Fatal(err)
	}
	first, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Release(t.Context(), id, first.Token); err != nil {
		t.Fatal(err)
	}
	attempt, err := store.Get(t.Context(), id)
	if err != nil || attempt.State != "queued" {
		t.Fatalf("shutdown release: %+v, %v", attempt, err)
	}
	second, err := store.ClaimNext(t.Context())
	if err != nil || second.ID != id || second.Token == first.Token || second.Attempts != 2 || !bytes.Equal(first.Ciphertext, second.Ciphertext) {
		t.Fatalf("reclaimed proposal changed: %+v, %v", second, err)
	}
	if err := store.Release(t.Context(), id, first.Token); !errors.Is(err, jobs.ErrClaimLost) {
		t.Fatalf("stale release: %v", err)
	}
	if err := store.Complete(t.Context(), id, first.Token, 200, time.Millisecond); !errors.Is(err, jobs.ErrClaimLost) {
		t.Fatalf("stale completion: %v", err)
	}
	if err := store.Complete(t.Context(), id, second.Token, 200, time.Millisecond); err != nil {
		t.Fatal(err)
	}
}

func TestExpiredLeaseIsFencedBeforeAndAfterReclaim(t *testing.T) {
	store, pool := newTestStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	first, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	// Advance persisted lease time at the database boundary, without a production clock hook.
	if _, err := pool.Exec(t.Context(), "UPDATE connector_save_attempts SET updated_at = clock_timestamp() - interval '3 minutes' WHERE id = $1", id); err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(t.Context(), id, first.Token, 200, time.Millisecond); !errors.Is(err, jobs.ErrClaimLost) {
		t.Fatalf("expired lease committed before reclaim: %v", err)
	}
	second, err := store.ClaimNext(t.Context())
	if err != nil || second.ID != id || second.Token == first.Token || second.Attempts != 2 {
		t.Fatalf("stale work not reclaimed: %+v, %v", second, err)
	}
	if err := store.Fail(t.Context(), id, first.Token, "timeout"); !errors.Is(err, jobs.ErrClaimLost) {
		t.Fatalf("old result changed the replacement claim: %v", err)
	}
	if err := store.Release(t.Context(), id, first.Token); !errors.Is(err, jobs.ErrClaimLost) {
		t.Fatalf("old release changed the replacement claim: %v", err)
	}
	if err := store.Complete(t.Context(), id, second.Token, 200, time.Millisecond); err != nil {
		t.Fatal(err)
	}
}

func TestExpiredAndExhaustedAttemptsDiscardCandidates(t *testing.T) {
	for _, tc := range []struct {
		name, code string
		claims     int
	}{{"queued expiry", "expired", 0}, {"running expiry", "expired", 1}, {"crash exhaustion", "attempts_exhausted", 5}} {
		t.Run(tc.name, func(t *testing.T) {
			store, pool := newTestStore(t)
			id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com", Credential: rand.Text(), CredentialLabel: "Fixture label"})
			if err != nil {
				t.Fatal(err)
			}
			var token string
			for i := 0; i < tc.claims; i++ {
				claim, err := store.ClaimNext(t.Context())
				if err != nil || claim.Attempts != int32(i+1) {
					t.Fatalf("acquisition %d: %+v, %v", i+1, claim, err)
				}
				token = claim.Token
				if _, err := pool.Exec(t.Context(), "UPDATE connector_save_attempts SET updated_at = clock_timestamp() - interval '3 minutes' WHERE id = $1", id); err != nil {
					t.Fatal(err)
				}
			}
			if tc.code == "expired" {
				if _, err := pool.Exec(t.Context(), "UPDATE connector_save_attempts SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1", id); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := store.ClaimNext(t.Context()); !errors.Is(err, jobs.ErrNoWork) {
				t.Fatalf("terminal candidate was claimed: %v", err)
			}
			attempt, err := store.Get(t.Context(), id)
			if err != nil || attempt.State != "finished" || attempt.FailureCode != tc.code {
				t.Fatalf("terminal cleanup: %+v, %v", attempt, err)
			}
			var cleared bool
			if err := pool.QueryRow(t.Context(), "SELECT candidate_ciphertext IS NULL FROM connector_save_attempts WHERE id = $1", id).Scan(&cleared); err != nil || !cleared {
				t.Fatal("terminal candidate retained ciphertext")
			}
			if err := store.Complete(t.Context(), id, token, 200, time.Millisecond); !errors.Is(err, jobs.ErrClaimLost) {
				t.Fatalf("terminal candidate committed: %v", err)
			}
		})
	}
}

func TestConcurrentWorkersCannotShareOrCompleteAClaimTwice(t *testing.T) {
	store, _ := newTestStore(t)
	if _, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com"}); err != nil {
		t.Fatal(err)
	}
	type result struct {
		claim jobs.Claim
		err   error
	}
	start := make(chan struct{})
	claimed := make(chan result, 2)
	for range 2 {
		go func() {
			<-start
			claim, err := store.ClaimNext(t.Context())
			claimed <- result{claim, err}
		}()
	}
	close(start)
	var held jobs.Claim
	for range 2 {
		r := <-claimed
		if r.err == nil {
			if held.ID != "" {
				t.Fatal("two workers acquired the same proposal")
			}
			held = r.claim
		} else if !errors.Is(r.err, jobs.ErrNoWork) {
			t.Fatal(r.err)
		}
	}
	if held.ID == "" {
		t.Fatal("neither worker acquired the proposal")
	}
	finished := make(chan error, 2)
	for range 2 {
		go func() { finished <- store.Complete(t.Context(), held.ID, held.Token, 200, time.Millisecond) }()
	}
	successes := 0
	for range 2 {
		if err := <-finished; err == nil {
			successes++
		} else if !errors.Is(err, jobs.ErrClaimLost) {
			t.Fatal(err)
		}
	}
	connectors, err := store.ListConnectors(t.Context())
	if successes != 1 || err != nil || len(connectors) != 1 {
		t.Fatalf("duplicate commit: successes=%d, active=%d, error=%v", successes, len(connectors), err)
	}
}

func TestClaimSkipsLockedProposal(t *testing.T) {
	for _, tt := range []struct {
		name, setup, failureCode string
	}{
		{name: "queued"},
		{
			name: "expired", failureCode: "expired",
			setup: "UPDATE connector_save_attempts SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
		},
		{
			name: "exhausted", failureCode: "attempts_exhausted",
			setup: `UPDATE connector_save_attempts SET state = 'running', claim_token = gen_random_uuid()::text,
				claim_attempts = 5, updated_at = clock_timestamp() - interval '3 minutes' WHERE id = $1`,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			store, pool := newTestStore(t)
			first, err := store.Stage(t.Context(), jobs.Proposal{Name: "First", BaseURL: "https://example.com"})
			if err != nil {
				t.Fatal(err)
			}
			second, err := store.Stage(t.Context(), jobs.Proposal{Name: "Second", BaseURL: "https://example.com"})
			if err != nil {
				t.Fatal(err)
			}
			if tt.setup != "" {
				if _, err := pool.Exec(t.Context(), tt.setup, first); err != nil {
					t.Fatal(err)
				}
			}
			blocker, err := pool.Begin(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = blocker.Rollback(t.Context()) }()
			if _, err := blocker.Exec(t.Context(), "SELECT id FROM connector_save_attempts WHERE id = $1 FOR UPDATE", first); err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(t.Context(), time.Second)
			defer cancel()
			claim, err := store.ClaimNext(ctx)
			if err != nil || claim.ID != second {
				t.Fatalf("locked work blocked the queue: %+v, %v", claim, err)
			}
			if err := blocker.Rollback(t.Context()); err != nil {
				t.Fatal(err)
			}
			if tt.failureCode != "" {
				if _, err := store.ClaimNext(t.Context()); !errors.Is(err, jobs.ErrNoWork) {
					t.Fatal(err)
				}
				attempt, err := store.Get(t.Context(), first)
				if err != nil || attempt.State != "finished" || attempt.FailureCode != tt.failureCode {
					t.Fatalf("unlocked candidate was not cleaned up: %+v, %v", attempt, err)
				}
			}
		})
	}
}

func TestCompletionFailureRollsBackAllWritesAndCanRetry(t *testing.T) {
	store, pool := newTestStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com", Credential: rand.Text(), CredentialLabel: "Fixture label"})
	if err != nil {
		t.Fatal(err)
	}
	claim, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(t.Context(), `
		CREATE FUNCTION reject_finish() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'injected completion failure'; END; $$;
		CREATE TRIGGER reject_finish BEFORE UPDATE OF state ON connector_save_attempts
		FOR EACH ROW WHEN (NEW.state = 'finished') EXECUTE FUNCTION reject_finish();
	`); err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(t.Context(), id, claim.Token, 200, time.Millisecond); err == nil {
		t.Fatal("injected completion failure was ignored")
	}
	connectors, err := store.ListConnectors(t.Context())
	if err != nil || len(connectors) != 0 {
		t.Fatal("rolled-back Connector became active")
	}
	var generations int
	if err := pool.QueryRow(t.Context(), "SELECT count(*) FROM credential_generations").Scan(&generations); err != nil || generations != 0 {
		t.Fatal("rolled-back generation survived")
	}
	attempt, err := store.Get(t.Context(), id)
	if err != nil || attempt.State != "running" {
		t.Fatalf("proposal was not recoverable after rollback: %+v, %v", attempt, err)
	}
	if _, err := pool.Exec(t.Context(), "DROP TRIGGER reject_finish ON connector_save_attempts; DROP FUNCTION reject_finish()"); err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(t.Context(), id, claim.Token, 200, time.Millisecond); err != nil {
		t.Fatal(err)
	}
}

func TestCancelledDatabaseWaitLeavesTheProposalRecoverable(t *testing.T) {
	store, pool := newTestStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	claim, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	blocker, err := pool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = blocker.Rollback(t.Context()) }()
	if _, err := blocker.Exec(t.Context(), "SELECT id FROM connector_save_attempts WHERE id = $1 FOR UPDATE", id); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Millisecond)
	defer cancel()
	if err := store.Complete(ctx, id, claim.Token, 200, time.Millisecond); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("database wait lost its deadline: %v", err)
	}
	if err := blocker.Rollback(t.Context()); err != nil {
		t.Fatal(err)
	}
	attempt, err := store.Get(t.Context(), id)
	if err != nil || attempt.State != "running" {
		t.Fatalf("cancelled write changed the proposal: %+v, %v", attempt, err)
	}
	if err := store.Complete(t.Context(), id, claim.Token, 200, time.Millisecond); err != nil {
		t.Fatal(err)
	}
}
