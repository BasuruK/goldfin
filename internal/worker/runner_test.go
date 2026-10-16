package worker_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/provider"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/testdb"
	"github.com/BasuruK/goldfin/internal/worker"
	"github.com/jackc/pgx/v5/pgxpool"
)

type checkFunc func(context.Context, string, string) (provider.Finding, error)

func (f checkFunc) CheckWebRequest(ctx context.Context, endpoint, credential string) (provider.Finding, error) {
	return f(ctx, endpoint, credential)
}

func newStore(t *testing.T) (*jobs.Store, *secretbox.Box, *pgxpool.Pool) {
	t.Helper()
	pool, db := testdb.New(t)
	migrator, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := migrator.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	key := bytes.Repeat([]byte{1}, 32)
	store, err := jobs.NewStore(pool, key)
	if err != nil {
		t.Fatal(err)
	}
	box, err := secretbox.New(key)
	if err != nil {
		t.Fatal(err)
	}
	return store, box, pool
}

func startWorker(t *testing.T, store *jobs.Store, box *secretbox.Box, check worker.Checker) (context.CancelFunc, <-chan error) {
	t.Helper()
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() {
		done <- worker.Run(ctx, store, box, check)
		close(done)
	}()
	t.Cleanup(func() {
		cancel()
		select {
		case err := <-done:
			if err != nil {
				t.Error(err)
			}
		case <-time.After(7 * time.Second):
			t.Error("worker did not stop")
		}
	})
	return cancel, done
}

func waitFinished(t *testing.T, store *jobs.Store, id string) jobs.Attempt {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	for {
		attempt, err := store.Get(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if attempt.State == "finished" {
			return attempt
		}
		select {
		case <-ctx.Done():
			t.Fatal("worker did not finish the Save attempt")
		case <-time.After(10 * time.Millisecond):
		}
	}
}

// fixtureCheck replaces the outbound-provider seam only; production uses provider.NewClient.
func fixtureCheck(client *http.Client) checkFunc {
	return func(ctx context.Context, endpoint, credential string) (provider.Finding, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodHead, endpoint, nil)
		if err != nil {
			return provider.Finding{}, err
		}
		if credential != "" {
			req.Header.Set("Authorization", "Bearer "+credential)
		}
		started := time.Now()
		res, err := client.Do(req)
		if err != nil {
			return provider.Finding{}, err
		}
		defer func() { _ = res.Body.Close() }()
		if res.StatusCode != http.StatusNoContent {
			return provider.Finding{}, fmt.Errorf("fixture status %d", res.StatusCode)
		}
		return provider.Finding{Kind: "reachable", HTTPStatus: res.StatusCode, Latency: time.Since(started)}, nil
	}
}

func TestWorkerCommitsCheckedProposal(t *testing.T) {
	for _, withCredential := range []bool{false, true} {
		t.Run(fmt.Sprintf("credential_%t", withCredential), func(t *testing.T) {
			store, box, _ := newStore(t)
			credential, label := "", ""
			if withCredential {
				credential, label = rand.Text(), "Fixture label"
			}
			server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				wantAuth := ""
				if withCredential {
					wantAuth = "Bearer " + credential
				}
				if r.Method != http.MethodHead || r.URL.RequestURI() != "/check?mode=fixture" || r.Header.Get("Authorization") != wantAuth {
					t.Error("worker changed the check request or Credential")
				}
				w.WriteHeader(http.StatusNoContent)
			}))
			t.Cleanup(server.Close)
			id, err := store.Stage(t.Context(), jobs.Proposal{
				Name: "Fixture", BaseURL: server.URL + "/check?mode=fixture", Credential: credential, CredentialLabel: label,
			})
			if err != nil {
				t.Fatal(err)
			}
			startWorker(t, store, box, fixtureCheck(server.Client()))
			attempt := waitFinished(t, store, id)
			if attempt.FindingKind != "reachable" || attempt.HTTPStatus != 204 || attempt.FailureCode != "" || attempt.ConnectorID == "" {
				t.Fatalf("successful check was not committed: %+v", attempt)
			}
			active, err := store.ListConnectors(t.Context())
			if err != nil || len(active) != 1 || active[0].ID != attempt.ConnectorID || active[0].CredentialLabel != label {
				t.Fatalf("committed Connector metadata is wrong: %+v, %v", active, err)
			}
		})
	}
}

func TestWorkerMapsFailedCheckWithoutExposingProviderDetails(t *testing.T) {
	store, box, _ := newStore(t)
	credential := rand.Text()
	id, err := store.Stage(t.Context(), jobs.Proposal{
		Name: "Fixture", BaseURL: "https://example.com", Credential: credential, CredentialLabel: "Fixture label",
	})
	if err != nil {
		t.Fatal(err)
	}
	startWorker(t, store, box, checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		return provider.Finding{Kind: "reachable", HTTPStatus: 204}, errors.New("provider response body contains " + credential)
	}))
	attempt := waitFinished(t, store, id)
	if attempt.FailureCode != "unreachable" || attempt.ConnectorID != "" || attempt.FindingKind != "" {
		t.Fatalf("failed check created active data: %+v", attempt)
	}
	encoded, err := json.Marshal(attempt)
	if err != nil || bytes.Contains(encoded, []byte(credential)) || bytes.Contains(encoded, []byte("provider response")) {
		t.Fatal("worker exposed provider details")
	}
	active, err := store.ListConnectors(t.Context())
	if err != nil || len(active) != 0 {
		t.Fatal("failed create added a Connector")
	}
}

func TestWorkerMapsCheckTimeoutWithinLeaseBudget(t *testing.T) {
	store, box, _ := newStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	startWorker(t, store, box, checkFunc(func(ctx context.Context, _, _ string) (provider.Finding, error) {
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) <= 0 || time.Until(deadline) > time.Minute {
			t.Error("worker did not bound the check below the two-minute lease")
		}
		return provider.Finding{}, context.DeadlineExceeded
	}))
	attempt := waitFinished(t, store, id)
	if attempt.FailureCode != "timeout" || attempt.ConnectorID != "" {
		t.Fatalf("timeout did not remain distinct: %+v", attempt)
	}
}

func TestWorkerShutdownCancelsAndRequeuesTheHeldProposal(t *testing.T) {
	for _, lateSuccess := range []bool{false, true} {
		t.Run(fmt.Sprintf("late_success_%t", lateSuccess), func(t *testing.T) {
			store, box, _ := newStore(t)
			credential := rand.Text()
			started := make(chan struct{})
			server := httptest.NewTLSServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				close(started)
				<-r.Context().Done()
			}))
			t.Cleanup(server.Close)
			check := fixtureCheck(server.Client())
			if lateSuccess {
				check = func(ctx context.Context, _, _ string) (provider.Finding, error) {
					close(started)
					<-ctx.Done()
					return provider.Finding{Kind: "reachable", HTTPStatus: 204}, nil
				}
			}
			id, err := store.Stage(t.Context(), jobs.Proposal{
				Name: "Fixture", BaseURL: server.URL, Credential: credential, CredentialLabel: "Fixture label",
			})
			if err != nil {
				t.Fatal(err)
			}
			cancel, done := startWorker(t, store, box, check)
			select {
			case <-started:
			case <-time.After(5 * time.Second):
				t.Fatal("worker did not start the check")
			}
			cancel()
			select {
			case err := <-done:
				if err != nil {
					t.Fatal(err)
				}
			case <-time.After(7 * time.Second):
				t.Fatal("worker did not stop after cancellation")
			}
			attempt, err := store.Get(t.Context(), id)
			if err != nil || attempt.State != "queued" || attempt.ConnectorID != "" {
				t.Fatalf("shutdown did not requeue the proposal: %+v, %v", attempt, err)
			}
			claim, err := store.ClaimNext(t.Context())
			if err != nil || claim.ID != id || claim.Attempts != 2 {
				t.Fatalf("released work could not be reclaimed: %+v, %v", claim, err)
			}
			plain, err := box.Decrypt(claim.Ciphertext)
			if err != nil || string(plain) != credential {
				t.Fatal("shutdown changed the encrypted proposal")
			}
		})
	}
}

func TestWorkerRejectsUnprovenFinding(t *testing.T) {
	store, box, _ := newStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	startWorker(t, store, box, checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		return provider.Finding{Kind: "unverified", HTTPStatus: 204}, nil
	}))
	attempt := waitFinished(t, store, id)
	if attempt.FailureCode != "unreachable" || attempt.ConnectorID != "" {
		t.Fatalf("an unproven finding was committed: %+v", attempt)
	}
}

func TestWorkerContinuesAfterItsClaimIsLost(t *testing.T) {
	for _, expired := range []bool{false, true} {
		t.Run(fmt.Sprintf("expired_%t", expired), func(t *testing.T) {
			store, box, pool := newStore(t)
			first, err := store.Stage(t.Context(), jobs.Proposal{Name: "First", BaseURL: "https://example.com"})
			if err != nil {
				t.Fatal(err)
			}
			started, resume := make(chan struct{}), make(chan struct{})
			calls := 0
			startWorker(t, store, box, checkFunc(func(ctx context.Context, _, _ string) (provider.Finding, error) {
				calls++
				if calls == 1 {
					close(started)
					select {
					case <-resume:
					case <-ctx.Done():
						return provider.Finding{}, ctx.Err()
					}
				}
				return provider.Finding{Kind: "reachable", HTTPStatus: 204}, nil
			}))
			select {
			case <-started:
			case <-time.After(5 * time.Second):
				t.Fatal("worker did not claim the proposal")
			}
			wantActive := 2
			if expired {
				if _, err := pool.Exec(t.Context(), "UPDATE connector_save_attempts SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1", first); err != nil {
					t.Fatal(err)
				}
				if _, err := store.ClaimNext(t.Context()); !errors.Is(err, jobs.ErrNoWork) {
					t.Fatal(err)
				}
				wantActive = 1
			} else {
				if _, err := pool.Exec(t.Context(), "UPDATE connector_save_attempts SET updated_at = clock_timestamp() - interval '3 minutes' WHERE id = $1", first); err != nil {
					t.Fatal(err)
				}
				replacement, err := store.ClaimNext(t.Context())
				if err != nil || replacement.ID != first || replacement.Attempts != 2 {
					t.Fatalf("crashed work could not be reclaimed: %+v, %v", replacement, err)
				}
				if err := store.Complete(t.Context(), first, replacement.Token, 204, time.Millisecond); err != nil {
					t.Fatal(err)
				}
			}
			second, err := store.Stage(t.Context(), jobs.Proposal{Name: "Second", BaseURL: "https://example.com"})
			if err != nil {
				t.Fatal(err)
			}
			close(resume)
			if attempt := waitFinished(t, store, second); attempt.ConnectorID == "" {
				t.Fatal("worker stopped after losing its old claim")
			}
			active, err := store.ListConnectors(t.Context())
			if err != nil || len(active) != wantActive {
				t.Fatalf("stale completion changed active data: %+v, %v", active, err)
			}
		})
	}
}

func TestTwoWorkersCannotCommitTheSameProposal(t *testing.T) {
	store, box, _ := newStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	checked := make(chan struct{}, 2)
	check := checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		checked <- struct{}{}
		return provider.Finding{Kind: "reachable", HTTPStatus: 204}, nil
	})
	startWorker(t, store, box, check)
	startWorker(t, store, box, check)
	if attempt := waitFinished(t, store, id); attempt.ConnectorID == "" {
		t.Fatal("neither worker committed the proposal")
	}
	active, err := store.ListConnectors(t.Context())
	if err != nil || len(active) != 1 || len(checked) != 1 {
		t.Fatal("workers checked or committed a proposal twice")
	}
}

func TestWorkerDecryptionFailureStopsAndReleasesTheProposal(t *testing.T) {
	store, _, _ := newStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{
		Name: "Fixture", BaseURL: "https://example.com", Credential: rand.Text(), CredentialLabel: "Fixture label",
	})
	if err != nil {
		t.Fatal(err)
	}
	wrongBox, err := secretbox.New(bytes.Repeat([]byte{2}, 32))
	if err != nil {
		t.Fatal(err)
	}
	err = worker.Run(t.Context(), store, wrongBox, checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		t.Error("worker called the provider after failed decryption")
		return provider.Finding{}, nil
	}))
	if err == nil || err.Error() != "worker could not decrypt Credential" {
		t.Fatalf("unsafe or missing decryption error: %v", err)
	}
	attempt, err := store.Get(t.Context(), id)
	if err != nil || attempt.State != "queued" || attempt.ConnectorID != "" {
		t.Fatalf("bad key destroyed or committed the proposal: %+v, %v", attempt, err)
	}
}

func TestWorkerCompletionFailureRollsBackAndReleases(t *testing.T) {
	store, box, pool := newStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{
		Name: "Fixture", BaseURL: "https://example.com", Credential: rand.Text(), CredentialLabel: "Fixture label",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(t.Context(), `
		CREATE FUNCTION reject_worker_finish() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'private database error'; END; $$;
		CREATE TRIGGER reject_worker_finish BEFORE UPDATE OF state ON connector_save_attempts
		FOR EACH ROW WHEN (NEW.state = 'finished') EXECUTE FUNCTION reject_worker_finish();
	`); err != nil {
		t.Fatal(err)
	}
	err = worker.Run(t.Context(), store, box, checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		return provider.Finding{Kind: "reachable", HTTPStatus: 204}, nil
	}))
	if err == nil || err.Error() != "worker could not finish Save attempt" {
		t.Fatalf("unsafe or missing storage error: %v", err)
	}
	attempt, err := store.Get(t.Context(), id)
	if err != nil || attempt.State != "queued" || attempt.ConnectorID != "" {
		t.Fatalf("failed completion was not recoverable: %+v, %v", attempt, err)
	}
	active, err := store.ListConnectors(t.Context())
	if err != nil || len(active) != 0 {
		t.Fatal("rolled-back Connector became active")
	}
	if _, err := pool.Exec(t.Context(), "DROP TRIGGER reject_worker_finish ON connector_save_attempts; DROP FUNCTION reject_worker_finish()"); err != nil {
		t.Fatal(err)
	}
	startWorker(t, store, box, checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		return provider.Finding{Kind: "reachable", HTTPStatus: 204}, nil
	}))
	if attempt := waitFinished(t, store, id); attempt.ConnectorID == "" {
		t.Fatal("released completion could not be retried")
	}
}

func TestIdleWorkerStopsPromptly(t *testing.T) {
	store, box, _ := newStore(t)
	cancel, done := startWorker(t, store, box, checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		t.Error("empty queue caused a provider call")
		return provider.Finding{}, nil
	}))
	select {
	case err := <-done:
		t.Fatalf("idle worker stopped before cancellation: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("idle wait ignored cancellation")
	}
}

func TestWorkerClaimFailureIsSafe(t *testing.T) {
	store, box, pool := newStore(t)
	if _, err := pool.Exec(t.Context(), "ALTER TABLE connector_save_attempts RENAME TO private_worker_failure"); err != nil {
		t.Fatal(err)
	}
	err := worker.Run(t.Context(), store, box, checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		t.Error("worker called the provider after a claim failure")
		return provider.Finding{}, nil
	}))
	if err == nil || err.Error() != "worker could not claim Save attempt" {
		t.Fatalf("unsafe or missing claim error: %v", err)
	}
}

func TestWorkerReportsShutdownReleaseFailure(t *testing.T) {
	store, box, pool := newStore(t)
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(t.Context(), `
		CREATE FUNCTION reject_worker_release() RETURNS trigger LANGUAGE plpgsql AS $$
		BEGIN RAISE EXCEPTION 'private release failure'; END; $$;
		CREATE TRIGGER reject_worker_release BEFORE UPDATE OF state ON connector_save_attempts
		FOR EACH ROW WHEN (NEW.state = 'queued') EXECUTE FUNCTION reject_worker_release();
	`); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	err = worker.Run(ctx, store, box, checkFunc(func(context.Context, string, string) (provider.Finding, error) {
		cancel()
		return provider.Finding{}, context.Canceled
	}))
	if err == nil || err.Error() != "worker could not release Save attempt" {
		t.Fatalf("unsafe or ignored release failure: %v", err)
	}
	attempt, err := store.Get(t.Context(), id)
	if err != nil || attempt.State != "running" || attempt.ConnectorID != "" {
		t.Fatalf("failed release changed active data: %+v, %v", attempt, err)
	}
}
