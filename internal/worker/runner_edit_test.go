package worker_test

import (
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/BasuruK/goldfin/internal/jobs"
)

func TestWorkerChecksEditsWithTheActiveCredentialAndSurvivesAStaleOne(t *testing.T) {
	store, box, _ := newStore(t)
	credential := rand.Text()
	var mu sync.Mutex
	var auths []string
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		auths = append(auths, r.Header.Get("Authorization"))
		mu.Unlock()
		w.WriteHeader(http.StatusNoContent)
	}))
	t.Cleanup(server.Close)
	startWorker(t, store, box, fixtureCheck(server.Client()))

	createID, err := store.Stage(t.Context(), jobs.Proposal{Name: "Original", BaseURL: server.URL, Credential: credential, CredentialLabel: "Label"})
	if err != nil {
		t.Fatal(err)
	}
	created := waitFinished(t, store, createID)
	connectors, err := store.ListConnectors(t.Context())
	if err != nil || len(connectors) != 1 || connectors[0].ID != created.ConnectorID {
		t.Fatalf("create: %+v, %v", connectors, err)
	}
	c := connectors[0]
	edit := func(revision int64, name string) string {
		id, err := store.StageEdit(t.Context(), jobs.EditProposal{ConnectorID: c.ID, BaseRevision: revision, Name: name, BaseURL: server.URL})
		if err != nil {
			t.Fatal(err)
		}
		return id
	}

	winner, stale := edit(c.Revision, "winner"), edit(c.Revision, "stale")
	if got := waitFinished(t, store, winner); got.FindingKind != "reachable" || got.ConnectorID != c.ID {
		t.Fatalf("edit was not committed: %+v", got)
	}
	if got := waitFinished(t, store, stale); got.FailureCode != "stale" || got.ConnectorID != "" {
		t.Fatalf("stale edit outcome: %+v", got)
	}

	// The worker must keep serving after a stale outcome.
	after := edit(c.Revision+1, "after")
	if got := waitFinished(t, store, after); got.FindingKind != "reachable" {
		t.Fatalf("worker stopped serving after a stale edit: %+v", got)
	}
	connectors, err = store.ListConnectors(t.Context())
	if err != nil || len(connectors) != 1 || connectors[0].Name != "after" || connectors[0].CredentialLabel != "Label" {
		t.Fatalf("active metadata: %+v, %v", connectors, err)
	}
	mu.Lock()
	defer mu.Unlock()
	for i, auth := range auths {
		if auth != "Bearer "+credential {
			t.Fatalf("check %d did not use the active Credential", i)
		}
	}
	if len(auths) != 4 {
		t.Fatalf("expected create + 3 edit checks, got %d", len(auths))
	}
}
