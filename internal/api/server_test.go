package api_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	"github.com/BasuruK/goldfin/internal/api"
	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/testdb"
	"github.com/jackc/pgx/v5/pgxpool"
)

func newAPI(t *testing.T) (http.Handler, *jobs.Store, *pgxpool.Pool) {
	t.Helper()
	pool, db := testdb.New(t)
	migrator, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := migrator.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	store, err := jobs.NewStore(pool, bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return api.NewHandler(store), store, pool
}

func request(t *testing.T, handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json; charset=utf-8")
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestAPIStagesCreateWithoutCommitting(t *testing.T) {
	handler, store, _ := newAPI(t)
	credential := rand.Text()
	body, err := json.Marshal(map[string]string{
		"name": "Fixture", "providerType": "web_request", "baseUrl": "https://example.com/check?mode=fixture",
		"credential": credential, "credentialLabel": "Fixture label",
	})
	if err != nil {
		t.Fatal(err)
	}
	response := request(t, handler, http.MethodPost, "/api/v1/connector-save-attempts", string(body))
	if response.Code != http.StatusAccepted {
		t.Fatalf("stage: %d %s", response.Code, response.Body.String())
	}
	var got struct{ ID, State string }
	if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil || got.ID == "" || got.State != "queued" {
		t.Fatalf("stage response: %s, %v", response.Body.String(), err)
	}
	if response.Header().Get("Location") != "/api/v1/connector-save-attempts/"+got.ID || response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing polling location or cache policy")
	}
	attempt, err := store.Get(t.Context(), got.ID)
	if err != nil || attempt.State != "queued" || attempt.ConnectorID != "" {
		t.Fatalf("staged attempt: %+v, %v", attempt, err)
	}
	active, err := store.ListConnectors(t.Context())
	if err != nil || len(active) != 0 || strings.Contains(response.Body.String(), credential) {
		t.Fatal("staging committed active data or returned a Credential")
	}
}

func TestAPIRejectsInvalidProposalsWithoutStaging(t *testing.T) {
	handler, store, _ := newAPI(t)
	valid := `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com"}`
	for _, tc := range []struct{ name, body, contentType string }{
		{"missing_name", `{"providerType":"web_request","baseUrl":"https://example.com"}`, "application/json"},
		{"blank_name", strings.Replace(valid, "Fixture", "  ", 1), "application/json"},
		{"unsupported_provider", strings.Replace(valid, "web_request", "openai", 1), "application/json"},
		{"relative_url", strings.Replace(valid, "https://example.com", "/check", 1), "application/json"},
		{"wrong_scheme", strings.Replace(valid, "https://example.com", "ftp://example.com", 1), "application/json"},
		{"missing_host", strings.Replace(valid, "https://example.com", "https:///check", 1), "application/json"},
		{"missing_hostname", strings.Replace(valid, "https://example.com", "https://:443/check", 1), "application/json"},
		{"userinfo", strings.Replace(valid, "https://example.com", "https://user:credential-canary@example.com", 1), "application/json"},
		{"fragment", strings.Replace(valid, "https://example.com", "https://example.com/#credential-canary", 1), "application/json"},
		{"invalid_port", strings.Replace(valid, "https://example.com", "https://example.com:65536", 1), "application/json"},
		{"zero_port", strings.Replace(valid, "https://example.com", "https://example.com:0", 1), "application/json"},
		{"malformed_url", strings.Replace(valid, "https://example.com", "https://[credential-canary", 1), "application/json"},
		{"malformed_query", strings.Replace(valid, "https://example.com", "https://example.com/?mode=%ZZ", 1), "application/json"},
		{"missing_label", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credential":"credential-canary"}`, "application/json"},
		{"blank_label", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credential":"credential-canary","credentialLabel":"  "}`, "application/json"},
		{"label_without_value", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credentialLabel":"Fixture label"}`, "application/json"},
		{"plaintext_credential", `{"name":"Fixture","providerType":"web_request","baseUrl":"http://example.com","credential":"credential-canary","credentialLabel":"Fixture label"}`, "application/json"},
		{"header_injection", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credential":"credential-canary\r\nInjected: yes","credentialLabel":"Fixture label"}`, "application/json"},
		{"null_field", strings.Replace(valid, `"Fixture"`, "null", 1), "application/json"},
		{"null_credential", strings.TrimSuffix(valid, "}") + `,"credential":null}`, "application/json"},
		{"number_field", strings.Replace(valid, `"Fixture"`, "42", 1), "application/json"},
		{"unknown_field", strings.TrimSuffix(valid, "}") + `,"connectorId":"ignored"}`, "application/json"},
		{"duplicate_field", strings.TrimSuffix(valid, "}") + `,"name":"Other"}`, "application/json"},
		{"trailing_json", valid + ` {}`, "application/json"},
		{"trailing_garbage", valid + ` invalid`, "application/json"},
		{"array_body", `[]`, "application/json"},
		{"null_body", `null`, "application/json"},
		{"malformed_json", `{`, "application/json"},
		{"oversized_body", strings.Replace(valid, "Fixture", strings.Repeat("a", 64<<10), 1), "application/json"},
		{"missing_content_type", valid, ""},
		{"wrong_content_type", valid, "text/plain"},
		{"json_prefix", valid, "application/json-invalid"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/connector-save-attempts", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", tc.contentType)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest || strings.Contains(rec.Body.String(), "credential-canary") || !json.Valid(rec.Body.Bytes()) {
				t.Fatalf("unsafe or accepted invalid proposal: %d %s", rec.Code, rec.Body.String())
			}
			if _, err := store.ClaimNext(t.Context()); !errors.Is(err, jobs.ErrNoWork) {
				t.Fatalf("invalid proposal entered the queue: %v", err)
			}
		})
	}
}

func TestAPIReportsStoredAttemptOutcomes(t *testing.T) {
	for _, outcome := range []string{"reachable", "timeout", "unreachable"} {
		t.Run(outcome, func(t *testing.T) {
			handler, store, _ := newAPI(t)
			id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Fixture", BaseURL: "https://example.com"})
			if err != nil {
				t.Fatal(err)
			}
			path := "/api/v1/connector-save-attempts/" + id
			queued := request(t, handler, http.MethodGet, path, "")
			if queued.Code != http.StatusOK || queued.Body.String() != `{"id":"`+id+`","state":"queued"}`+"\n" {
				t.Fatalf("queued response: %d %s", queued.Code, queued.Body.String())
			}
			claim, err := store.ClaimNext(t.Context())
			if err != nil {
				t.Fatal(err)
			}
			running := request(t, handler, http.MethodGet, path, "")
			if running.Code != http.StatusOK || running.Body.String() != `{"id":"`+id+`","state":"running"}`+"\n" {
				t.Fatalf("running response: %d %s", running.Code, running.Body.String())
			}
			if outcome == "reachable" {
				err = store.Complete(t.Context(), claim.ID, claim.Token, 204, 12*time.Millisecond)
			} else {
				err = store.Fail(t.Context(), claim.ID, claim.Token, outcome)
			}
			if err != nil {
				t.Fatal(err)
			}
			finished := request(t, handler, http.MethodGet, path, "")
			var got struct {
				ID, State, ConnectorID, FailureCode string
				Finding                             *struct {
					Kind       string
					HTTPStatus int
					LatencyMS  int64
				}
			}
			if err := json.Unmarshal(finished.Body.Bytes(), &got); err != nil || finished.Code != http.StatusOK || got.ID != id || got.State != "finished" {
				t.Fatalf("finished response: %d %s, %v", finished.Code, finished.Body.String(), err)
			}
			if outcome == "reachable" {
				if got.ConnectorID == "" || got.FailureCode != "" || got.Finding == nil || got.Finding.Kind != "reachable" || got.Finding.HTTPStatus != 204 || got.Finding.LatencyMS != 12 {
					t.Fatalf("successful finding: %s", finished.Body.String())
				}
			} else if got.ConnectorID != "" || got.Finding != nil || got.FailureCode != outcome {
				t.Fatalf("failed finding: %s", finished.Body.String())
			}
			if strings.Contains(finished.Body.String(), claim.Token) || strings.Contains(finished.Body.String(), "ciphertext") || finished.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("poll exposed claim data or allowed caching")
			}
		})
	}
}

func TestAPIListsOnlyCommittedSafeMetadata(t *testing.T) {
	handler, store, _ := newAPI(t)
	empty := request(t, handler, http.MethodGet, "/api/v1/connectors", "")
	if empty.Code != http.StatusOK || empty.Body.String() != "{\"connectors\":[]}\n" {
		t.Fatalf("empty list: %d %s", empty.Code, empty.Body.String())
	}
	credential := rand.Text()
	id, err := store.Stage(t.Context(), jobs.Proposal{Name: "Saved fixture", BaseURL: "https://example.com/check", Credential: credential, CredentialLabel: "Customer label"})
	if err != nil {
		t.Fatal(err)
	}
	claim, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Complete(t.Context(), id, claim.Token, 204, time.Millisecond); err != nil {
		t.Fatal(err)
	}
	failedID, err := store.Stage(t.Context(), jobs.Proposal{Name: "Failed fixture", BaseURL: "https://example.com/fail"})
	if err != nil {
		t.Fatal(err)
	}
	failed, err := store.ClaimNext(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Fail(t.Context(), failedID, failed.Token, "unreachable"); err != nil {
		t.Fatal(err)
	}
	response := request(t, api.NewHandler(store), http.MethodGet, "/api/v1/connectors", "")
	var got struct {
		Connectors []struct {
			ID, Name, ProviderType, BaseURL, CredentialLabel string
			CredentialSetAt                                  *time.Time
		}
	}
	decoder := json.NewDecoder(response.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&got); err != nil || response.Code != http.StatusOK || len(got.Connectors) != 1 {
		t.Fatalf("committed list: %d %+v, %v", response.Code, got, err)
	}
	saved := got.Connectors[0]
	if saved.ID == "" || saved.Name != "Saved fixture" || saved.ProviderType != "web_request" || saved.BaseURL != "https://example.com/check" || saved.CredentialLabel != "Customer label" || saved.CredentialSetAt == nil {
		t.Fatalf("incomplete committed metadata: %+v", saved)
	}
	if response.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("saved metadata may be cached")
	}
}

func TestAPIRejectsCredentialQueryParameters(t *testing.T) {
	handler, store, _ := newAPI(t)
	for _, key := range []string{"api_key", "token", "access_token", "sig", "key", "subscription-key", "X-Amz-Signature", "ToKeN", "%61pi_key"} {
		t.Run(key, func(t *testing.T) {
			body := `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com/?` + key + `=credential-canary"}`
			response := request(t, handler, http.MethodPost, "/api/v1/connector-save-attempts", body)
			if response.Code != http.StatusBadRequest || strings.Contains(response.Body.String(), "credential-canary") {
				t.Fatalf("URL secret guard: %d %s", response.Code, response.Body.String())
			}
		})
	}
	if _, err := store.ClaimNext(t.Context()); !errors.Is(err, jobs.ErrNoWork) {
		t.Fatalf("URL Credential entered the queue: %v", err)
	}
}

func TestAPITrimsMetadataAndPreservesCredentialBytes(t *testing.T) {
	for _, credential := range []string{"", " padded-Credential "} {
		t.Run(credential, func(t *testing.T) {
			handler, store, _ := newAPI(t)
			label, endpoint := "", " http://example.com/check?mode=fixture "
			if credential != "" {
				label, endpoint = " Customer label ", " https://example.com/check?mode=fixture "
			}
			body, err := json.Marshal(map[string]string{"name": " Fixture ", "providerType": " web_request ", "baseUrl": endpoint, "credential": credential, "credentialLabel": label})
			if err != nil {
				t.Fatal(err)
			}
			response := request(t, handler, http.MethodPost, "/api/v1/connector-save-attempts", string(body))
			if response.Code != http.StatusAccepted {
				t.Fatalf("valid proposal rejected: %d %s", response.Code, response.Body.String())
			}
			claim, err := store.ClaimNext(t.Context())
			if err != nil || claim.Name != "Fixture" || claim.BaseURL != strings.TrimSpace(endpoint) || claim.CredentialLabel != strings.TrimSpace(label) {
				t.Fatalf("metadata did not round-trip: %+v, %v", claim, err)
			}
			if credential == "" {
				if claim.Ciphertext != nil {
					t.Fatal("omitted Credential gained a value")
				}
			} else {
				box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
				if err != nil {
					t.Fatal(err)
				}
				plain, err := box.Decrypt(claim.Ciphertext)
				if err != nil || string(plain) != credential {
					t.Fatal("API changed the Credential bytes")
				}
			}
		})
	}
}

func TestAPIMissingAttemptAndWrongMethod(t *testing.T) {
	handler, _, _ := newAPI(t)
	missing := request(t, handler, http.MethodGet, "/api/v1/connector-save-attempts/missing-credential-canary", "")
	if missing.Code != http.StatusNotFound || missing.Body.String() != "{\"message\":\"Save attempt not found.\"}\n" {
		t.Fatalf("missing attempt: %d %s", missing.Code, missing.Body.String())
	}
	wrong := request(t, handler, http.MethodDelete, "/api/v1/connectors", "")
	if wrong.Code != http.StatusMethodNotAllowed || wrong.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unsupported method: %d", wrong.Code)
	}
}

func TestAPIDatabaseFailuresAndCancellationAreSafe(t *testing.T) {
	handler, _, pool := newAPI(t)
	pool.Close()
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodPost, "/api/v1/connector-save-attempts", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credential":"credential-canary","credentialLabel":"Fixture label"}`},
		{http.MethodGet, "/api/v1/connector-save-attempts/credential-canary", ""},
		{http.MethodGet, "/api/v1/connectors", ""},
	} {
		response := request(t, handler, tc.method, tc.path, tc.body)
		if response.Code != http.StatusServiceUnavailable || !json.Valid(response.Body.Bytes()) || strings.Contains(response.Body.String(), "credential-canary") || strings.Contains(response.Body.String(), "closed") {
			t.Fatalf("database error exposed details: %d %s", response.Code, response.Body.String())
		}
	}
	handler, store, _ := newAPI(t)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	req := httptest.NewRequestWithContext(ctx, http.MethodPost, "/api/v1/connector-save-attempts", strings.NewReader(`{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("canceled create reported success: %d %s", rec.Code, rec.Body.String())
	}
	if _, err := store.ClaimNext(t.Context()); !errors.Is(err, jobs.ErrNoWork) {
		t.Fatalf("canceled create entered the queue: %v", err)
	}
}

func TestAPIBoundsDatabaseWaits(t *testing.T) {
	handler, store, pool := newAPI(t)
	tx, err := pool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.WithoutCancel(t.Context())) })
	if _, err := tx.Exec(t.Context(), "LOCK TABLE connector_save_attempts IN ACCESS EXCLUSIVE MODE"); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	response := request(t, handler, http.MethodPost, "/api/v1/connector-save-attempts", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com"}`)
	if response.Code != http.StatusServiceUnavailable || time.Since(started) > 7*time.Second {
		t.Fatalf("unbounded or successful blocked Save: %d after %s", response.Code, time.Since(started))
	}
	if err := tx.Rollback(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ClaimNext(t.Context()); !errors.Is(err, jobs.ErrNoWork) {
		t.Fatalf("timed-out write staged a proposal: %v", err)
	}
}

func TestAPIConcurrentSubmissionsHaveIndependentHandles(t *testing.T) {
	handler, store, _ := newAPI(t)
	responses := make(chan *httptest.ResponseRecorder, 2)
	for _, name := range []string{"First", "Second"} {
		req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/connector-save-attempts", strings.NewReader(`{"name":"`+name+`","providerType":"web_request","baseUrl":"https://example.com"}`))
		req.Header.Set("Content-Type", "application/json")
		go func() {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			responses <- rec
		}()
	}
	ids := map[string]bool{}
	for range 2 {
		response := <-responses
		var got struct{ ID, State string }
		if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil || response.Code != http.StatusAccepted || got.ID == "" || got.State != "queued" || ids[got.ID] {
			t.Fatalf("submissions were combined or rejected: %d %s", response.Code, response.Body.String())
		}
		ids[got.ID] = true
	}
	for range 2 {
		claim, err := store.ClaimNext(t.Context())
		if err != nil || !ids[claim.ID] {
			t.Fatalf("proposal missing from queue: %v", err)
		}
		delete(ids, claim.ID)
	}
	active, err := store.ListConnectors(t.Context())
	if err != nil || len(active) != 0 {
		t.Fatal("concurrent creates bypassed worker checks")
	}
}
