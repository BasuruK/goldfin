package jobs_test

import (
	"bytes"
	"crypto/rand"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/jackc/pgx/v5/pgxpool"
)

// createConnector commits a Connector through the real staged-create path.
func createConnector(t *testing.T, store *jobs.Store, proposal jobs.Proposal) jobs.Connector {
	t.Helper()
	id, err := store.Stage(t.Context(), proposal)
	if err != nil {
		t.Fatal(err)
	}
	claim, err := store.ClaimNext(t.Context())
	if err != nil || claim.ID != id {
		t.Fatalf("claim create: %+v, %v", claim, err)
	}
	if err := store.Complete(t.Context(), id, claim.Token, 204, time.Millisecond); err != nil {
		t.Fatal(err)
	}
	connectors, err := store.ListConnectors(t.Context())
	if err != nil || len(connectors) == 0 {
		t.Fatalf("list after create: %+v, %v", connectors, err)
	}
	return connectors[len(connectors)-1]
}

func generationCount(t *testing.T, pool *pgxpool.Pool, connectorID string) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(t.Context(), "SELECT count(*) FROM credential_generations WHERE connector_id = $1", connectorID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestMetadataOnlyEditKeepsTheCredentialGeneration(t *testing.T) {
	store, pool := newTestStore(t)
	before := createConnector(t, store, jobs.Proposal{
		Name: "Original", BaseURL: "https://example.com/check",
		Credential: rand.Text(), CredentialLabel: "Fixture label",
	})
	id, err := store.StageEdit(t.Context(), jobs.EditProposal{
		ConnectorID: before.ID, BaseRevision: before.Revision, Name: "Renamed", BaseURL: "https://example.com/check",
	})
	if err != nil {
		t.Fatal(err)
	}
	if connectors, _ := store.ListConnectors(t.Context()); connectors[0].Name != "Original" {
		t.Fatal("staging an edit changed active data")
	}
	claim, err := store.ClaimNext(t.Context())
	if err != nil || claim.ID != id || claim.BaseURL != "https://example.com/check" {
		t.Fatalf("claim edit: %+v, %v", claim, err)
	}
	if err := store.Complete(t.Context(), id, claim.Token, 200, 5*time.Millisecond); err != nil {
		t.Fatal(err)
	}
	attempt, err := store.Get(t.Context(), id)
	if err != nil || attempt.State != "finished" || attempt.ConnectorID != before.ID || attempt.FindingKind != "reachable" {
		t.Fatalf("edit completion: %+v, %v", attempt, err)
	}
	connectors, err := store.ListConnectors(t.Context())
	if err != nil || len(connectors) != 1 {
		t.Fatalf("list: %+v, %v", connectors, err)
	}
	after := connectors[0]
	if after.Name != "Renamed" || after.BaseURL != "https://example.com/check" || after.Revision != before.Revision+1 {
		t.Fatalf("edit not applied: %+v", after)
	}
	if after.CredentialLabel != before.CredentialLabel || !after.CredentialSetAt.Equal(*before.CredentialSetAt) {
		t.Fatalf("unchanged Credential was replaced: %+v", after)
	}
	if n := generationCount(t, pool, before.ID); n != 1 {
		t.Fatalf("ordinary edit created %d generations", n)
	}
}

// generationPlaintext decrypts one stored generation for assertions on persisted bytes.
func generationPlaintext(t *testing.T, pool *pgxpool.Pool, connectorID, state string) (label, plain string) {
	t.Helper()
	var encrypted []byte
	if err := pool.QueryRow(t.Context(),
		"SELECT label, ciphertext FROM credential_generations WHERE connector_id = $1 AND state = $2",
		connectorID, state).Scan(&label, &encrypted); err != nil {
		t.Fatalf("%s generation: %v", state, err)
	}
	box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	decrypted, err := box.Decrypt(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	return label, string(decrypted)
}

func TestReplacementAppendsAnImmutableGenerationAndSupersedesThePreviousOne(t *testing.T) {
	for _, tc := range []struct {
		name       string
		initial    jobs.Proposal
		generation int
	}{
		{"replacing a Credential", jobs.Proposal{Name: "N", BaseURL: "https://example.com", Credential: "first-secret", CredentialLabel: "First"}, 2},
		{"adding the first Credential", jobs.Proposal{Name: "N", BaseURL: "https://example.com"}, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store, pool := newTestStore(t)
			before := createConnector(t, store, tc.initial)
			id, err := store.StageEdit(t.Context(), jobs.EditProposal{
				ConnectorID: before.ID, BaseRevision: before.Revision, Name: "N", BaseURL: "https://example.com",
				Credential: "second-secret", CredentialLabel: "Second",
			})
			if err != nil {
				t.Fatal(err)
			}
			claim, err := store.ClaimNext(t.Context())
			if err != nil || claim.ID != id || len(claim.Ciphertext) == 0 {
				t.Fatalf("claim carries the candidate: %+v, %v", claim, err)
			}
			if err := store.Complete(t.Context(), id, claim.Token, 200, time.Millisecond); err != nil {
				t.Fatal(err)
			}
			connectors, err := store.ListConnectors(t.Context())
			if err != nil || len(connectors) != 1 || connectors[0].CredentialLabel != "Second" || connectors[0].Revision != before.Revision+1 {
				t.Fatalf("active metadata: %+v, %v", connectors, err)
			}
			if tc.initial.Credential != "" && !connectors[0].CredentialSetAt.After(*before.CredentialSetAt) {
				t.Fatal("replacement did not advance the Credential timestamp")
			}
			if n := generationCount(t, pool, before.ID); n != tc.generation {
				t.Fatalf("generations: got %d, want %d", n, tc.generation)
			}
			if label, plain := generationPlaintext(t, pool, before.ID, "active"); label != "Second" || plain != "second-secret" {
				t.Fatalf("active generation: %q", label)
			}
			if tc.initial.Credential != "" {
				if label, plain := generationPlaintext(t, pool, before.ID, "superseded"); label != "First" || plain != "first-secret" {
					t.Fatalf("superseded generation was rewritten: %q", label)
				}
			}
			var retained bool
			if err := pool.QueryRow(t.Context(), "SELECT candidate_ciphertext IS NOT NULL FROM connector_save_attempts WHERE id = $1", id).Scan(&retained); err != nil || retained {
				t.Fatalf("candidate retained after commit: %v", err)
			}
		})
	}
}

func TestEditProposalRequiresALabelExactlyWhenACredentialIsReplaced(t *testing.T) {
	store, _ := newTestStore(t)
	c := createConnector(t, store, jobs.Proposal{Name: "N", BaseURL: "https://example.com"})
	base := jobs.EditProposal{ConnectorID: c.ID, BaseRevision: c.Revision, Name: "N", BaseURL: "https://example.com"}
	for name, mutate := range map[string]func(*jobs.EditProposal){
		"Credential without label": func(p *jobs.EditProposal) { p.Credential = "secret" },
		"label without Credential": func(p *jobs.EditProposal) { p.CredentialLabel = "Label" },
		"blank name":               func(p *jobs.EditProposal) { p.Name = " " },
	} {
		proposal := base
		mutate(&proposal)
		if _, err := store.StageEdit(t.Context(), proposal); !errors.Is(err, jobs.ErrInvalidProposal) {
			t.Fatalf("%s: %v", name, err)
		}
	}
	proposal := base
	proposal.ConnectorID = "missing"
	if _, err := store.StageEdit(t.Context(), proposal); !errors.Is(err, jobs.ErrNotFound) {
		t.Fatalf("unknown Connector: %v", err)
	}
}

func TestUnchangedCredentialIsCarriedToTheWorkerWithoutCopying(t *testing.T) {
	store, pool := newTestStore(t)
	c := createConnector(t, store, jobs.Proposal{Name: "N", BaseURL: "https://example.com", Credential: "kept-secret", CredentialLabel: "Kept"})
	id, err := store.StageEdit(t.Context(), jobs.EditProposal{ConnectorID: c.ID, BaseRevision: c.Revision, Name: "N2", BaseURL: "https://example.com"})
	if err != nil {
		t.Fatal(err)
	}
	var candidate bool
	if err := pool.QueryRow(t.Context(), "SELECT candidate_ciphertext IS NOT NULL FROM connector_save_attempts WHERE id = $1", id).Scan(&candidate); err != nil || candidate {
		t.Fatalf("unchanged edit stored a candidate: %v", err)
	}
	claim, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	if plain, err := box.Decrypt(claim.Ciphertext); err != nil || string(plain) != "kept-secret" {
		t.Fatalf("claim did not carry the active Credential for the check: %v", err)
	}
	if err := store.Complete(t.Context(), id, claim.Token, 200, time.Millisecond); err != nil {
		t.Fatal(err)
	}
	if n := generationCount(t, pool, c.ID); n != 1 {
		t.Fatalf("unchanged Credential created %d generations", n)
	}
}

func TestChangingTheBaseURLRequiresReplacingTheCredential(t *testing.T) {
	store, pool := newTestStore(t)
	c := createConnector(t, store, jobs.Proposal{Name: "N", BaseURL: "https://example.com", Credential: "kept-secret", CredentialLabel: "Kept"})
	_, err := store.StageEdit(t.Context(), jobs.EditProposal{ConnectorID: c.ID, BaseRevision: c.Revision, Name: "N", BaseURL: "https://elsewhere.example"})
	if !errors.Is(err, jobs.ErrInvalidProposal) {
		t.Fatalf("URL change without a replacement Credential: %v", err)
	}
	var attempts int
	if err := pool.QueryRow(t.Context(), "SELECT count(*) FROM connector_save_attempts WHERE target_connector_id IS NOT NULL").Scan(&attempts); err != nil || attempts != 0 {
		t.Fatalf("rejected edit was staged: %d, %v", attempts, err)
	}
	// A replacement Credential is the owner's explicit choice to send a secret to the new URL.
	if _, err := store.StageEdit(t.Context(), jobs.EditProposal{
		ConnectorID: c.ID, BaseRevision: c.Revision, Name: "N", BaseURL: "https://elsewhere.example",
		Credential: "new-secret", CredentialLabel: "New",
	}); err != nil {
		t.Fatalf("URL change with a replacement Credential: %v", err)
	}
}

func TestClaimNeverCarriesTheActiveCredentialToAnotherURL(t *testing.T) {
	store, pool := newTestStore(t)
	c := createConnector(t, store, jobs.Proposal{Name: "N", BaseURL: "https://example.com", Credential: "kept-secret", CredentialLabel: "Kept"})
	// Staging rejects this, so insert it directly to prove the claim itself is safe.
	if _, err := pool.Exec(t.Context(),
		`INSERT INTO connector_save_attempts (name, base_url, target_connector_id, base_revision, expires_at)
		 VALUES ('N', 'https://elsewhere.example', $1, $2, now() + interval '1 minute')`, c.ID, c.Revision); err != nil {
		t.Fatal(err)
	}
	claim, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if claim.Ciphertext != nil {
		t.Fatal("claim carried the active Credential to a different URL")
	}
}

func TestStaleEditsFinishStaleAndNeverOverwriteTheNewerConfiguration(t *testing.T) {
	store, pool := newTestStore(t)
	c := createConnector(t, store, jobs.Proposal{Name: "Original", BaseURL: "https://example.com", Credential: "first-secret", CredentialLabel: "First"})
	stage := func(name, credential, label string) string {
		url := "https://example.com" // an edit keeping the Credential cannot move to another URL
		if credential != "" {
			url += "/" + name
		}
		id, err := store.StageEdit(t.Context(), jobs.EditProposal{
			ConnectorID: c.ID, BaseRevision: c.Revision, Name: name, BaseURL: url,
			Credential: credential, CredentialLabel: label,
		})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	winnerID, loserID := stage("winner", "", ""), stage("loser", "loser-secret", "Loser")
	winner, err := store.ClaimNext(t.Context())
	if err != nil || winner.ID != winnerID {
		t.Fatalf("claim winner: %+v, %v", winner, err)
	}
	loser, err := store.ClaimNext(t.Context())
	if err != nil || loser.ID != loserID {
		t.Fatalf("claim loser: %+v, %v", loser, err)
	}
	if err := store.Complete(t.Context(), winnerID, winner.Token, 200, time.Millisecond); err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(t.Context(), loserID, loser.Token, 200, time.Millisecond); !errors.Is(err, jobs.ErrStale) {
		t.Fatalf("stale edit: %v", err)
	}
	attempt, err := store.Get(t.Context(), loserID)
	if err != nil || attempt.State != "finished" || attempt.FailureCode != "stale" || attempt.ConnectorID != "" || attempt.FindingKind != "" {
		t.Fatalf("stale outcome: %+v, %v", attempt, err)
	}
	connectors, err := store.ListConnectors(t.Context())
	if err != nil || len(connectors) != 1 || connectors[0].Name != "winner" || connectors[0].CredentialLabel != "First" || connectors[0].Revision != c.Revision+1 {
		t.Fatalf("stale edit changed active data: %+v, %v", connectors, err)
	}
	if n := generationCount(t, pool, c.ID); n != 1 {
		t.Fatalf("stale replacement left %d generations", n)
	}
	var retained bool
	if err := pool.QueryRow(t.Context(), "SELECT candidate_ciphertext IS NOT NULL FROM connector_save_attempts WHERE id = $1", loserID).Scan(&retained); err != nil || retained {
		t.Fatalf("stale candidate retained: %v", err)
	}
	if err := store.Complete(t.Context(), loserID, loser.Token, 200, time.Millisecond); !errors.Is(err, jobs.ErrClaimLost) {
		t.Fatalf("duplicate completion after stale: %v", err)
	}
}

func TestConcurrentEditsAtOneRevisionCommitExactlyOnce(t *testing.T) {
	store, pool := newTestStore(t)
	c := createConnector(t, store, jobs.Proposal{Name: "Original", BaseURL: "https://example.com"})
	claims := make([]jobs.Claim, 2)
	for i := range claims {
		if _, err := store.StageEdit(t.Context(), jobs.EditProposal{
			ConnectorID: c.ID, BaseRevision: c.Revision, Name: "edit", BaseURL: "https://example.com",
			Credential: "secret", CredentialLabel: "Label",
		}); err != nil {
			t.Fatal(err)
		}
		claim, err := store.ClaimNext(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		claims[i] = claim
	}
	errs := make([]error, len(claims))
	var wg sync.WaitGroup
	for i := range claims {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = store.Complete(t.Context(), claims[i].ID, claims[i].Token, 200, time.Millisecond)
		}()
	}
	wg.Wait()
	committed, stale := 0, 0
	for _, err := range errs {
		switch {
		case err == nil:
			committed++
		case errors.Is(err, jobs.ErrStale):
			stale++
		default:
			t.Fatalf("unexpected completion error: %v", err)
		}
	}
	if committed != 1 || stale != 1 {
		t.Fatalf("committed=%d stale=%d", committed, stale)
	}
	var active int
	if err := pool.QueryRow(t.Context(), "SELECT count(*) FROM credential_generations WHERE connector_id = $1 AND state = 'active'", c.ID).Scan(&active); err != nil || active != 1 {
		t.Fatalf("active generations: %d, %v", active, err)
	}
}

func TestFailedReleasedAndExpiredEditsLeaveActiveDataUntouched(t *testing.T) {
	store, pool := newTestStore(t)
	c := createConnector(t, store, jobs.Proposal{Name: "Original", BaseURL: "https://example.com", Credential: "first-secret", CredentialLabel: "First"})
	stage := func() string {
		id, err := store.StageEdit(t.Context(), jobs.EditProposal{
			ConnectorID: c.ID, BaseRevision: c.Revision, Name: "Changed", BaseURL: "https://example.com/changed",
			Credential: "new-secret", CredentialLabel: "New",
		})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}
	assertUntouched := func(id, code string) {
		t.Helper()
		attempt, err := store.Get(t.Context(), id)
		if err != nil || attempt.State != "finished" || attempt.FailureCode != code || attempt.ConnectorID != "" {
			t.Fatalf("outcome: %+v, %v", attempt, err)
		}
		connectors, err := store.ListConnectors(t.Context())
		if err != nil || len(connectors) != 1 || connectors[0].Name != "Original" || connectors[0].BaseURL != "https://example.com" ||
			connectors[0].CredentialLabel != "First" || connectors[0].Revision != c.Revision {
			t.Fatalf("active data changed: %+v, %v", connectors, err)
		}
		if n := generationCount(t, pool, c.ID); n != 1 {
			t.Fatalf("generations: %d", n)
		}
		var retained bool
		if err := pool.QueryRow(t.Context(), "SELECT candidate_ciphertext IS NOT NULL FROM connector_save_attempts WHERE id = $1", id).Scan(&retained); err != nil || retained {
			t.Fatalf("candidate retained: %v", err)
		}
	}

	for _, code := range []string{"unreachable", "timeout"} {
		id := stage()
		claim, err := store.ClaimNext(t.Context())
		if err != nil {
			t.Fatal(err)
		}
		if err := store.Fail(t.Context(), id, claim.Token, code); err != nil {
			t.Fatal(err)
		}
		assertUntouched(id, code)
	}

	id := stage()
	claim, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Release(t.Context(), id, claim.Token); err != nil {
		t.Fatal(err)
	}
	reclaimed, err := store.ClaimNext(t.Context())
	if err != nil || reclaimed.ID != id || reclaimed.Token == claim.Token || len(reclaimed.Ciphertext) == 0 {
		t.Fatalf("released edit lost its proposal: %+v, %v", reclaimed, err)
	}
	if _, err := pool.Exec(t.Context(), "UPDATE connector_save_attempts SET expires_at = now() - interval '1 second' WHERE id = $1", id); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ClaimNext(t.Context()); !errors.Is(err, jobs.ErrNoWork) {
		t.Fatalf("expired edit was claimable: %v", err)
	}
	assertUntouched(id, "expired")
	if err := store.Complete(t.Context(), id, reclaimed.Token, 200, time.Millisecond); !errors.Is(err, jobs.ErrClaimLost) {
		t.Fatalf("late completion after expiry: %v", err)
	}
}

func TestCompletionFailureRollsBackEditAndReplacementTogether(t *testing.T) {
	store, pool := newTestStore(t)
	c := createConnector(t, store, jobs.Proposal{Name: "Original", BaseURL: "https://example.com", Credential: "first-secret", CredentialLabel: "First"})
	id, err := store.StageEdit(t.Context(), jobs.EditProposal{
		ConnectorID: c.ID, BaseRevision: c.Revision, Name: "Changed", BaseURL: "https://example.com/changed",
		Credential: "new-secret", CredentialLabel: "New",
	})
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
	if err != nil || len(connectors) != 1 || connectors[0].Name != "Original" || connectors[0].CredentialLabel != "First" || connectors[0].Revision != c.Revision {
		t.Fatalf("rolled-back edit became active: %+v, %v", connectors, err)
	}
	if label, plain := generationPlaintext(t, pool, c.ID, "active"); label != "First" || plain != "first-secret" || generationCount(t, pool, c.ID) != 1 {
		t.Fatal("rolled-back replacement changed the generations")
	}
	if attempt, err := store.Get(t.Context(), id); err != nil || attempt.State != "running" {
		t.Fatalf("edit was not recoverable after rollback: %+v, %v", attempt, err)
	}
	if _, err := pool.Exec(t.Context(), "DROP TRIGGER reject_finish ON connector_save_attempts; DROP FUNCTION reject_finish()"); err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(t.Context(), id, claim.Token, 200, time.Millisecond); err != nil {
		t.Fatal(err)
	}
}
