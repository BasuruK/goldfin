package api_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	"github.com/BasuruK/goldfin/internal/handler"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/testdb"
	"github.com/jackc/pgx/v5/pgxpool"
)

func newAPI(t *testing.T) (http.Handler, *pgxpool.Pool, *secretbox.Box) {
	t.Helper()
	pool, db := testdb.New(t)
	migrator, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := migrator.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return handler.New(pool, box, nil), pool, box
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

func countConnectors(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(t.Context(), "SELECT count(*) FROM connectors").Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

type connector struct {
	ID, Name, ProviderType, BaseURL, APIVersion, CredentialLabel string
	CredentialSetAt                                              *time.Time
}

func TestAPICreatesAConnectorAndEncryptsItsCredential(t *testing.T) {
	handler, pool, box := newAPI(t)
	secret := rand.Text()
	padded, label := " padded-"+secret+" ", " Prod key "
	body, err := json.Marshal(map[string]string{
		"name": " Gateway ", "providerType": " web_request ", "baseUrl": " https://example.com/extract?mode=fixture ",
		"credential": padded, "credentialLabel": label,
	})
	if err != nil {
		t.Fatal(err)
	}
	created := request(t, handler, http.MethodPost, "/api/v1/connectors", string(body))
	if created.Code != http.StatusCreated || created.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("create: %d %s", created.Code, created.Body.String())
	}
	if strings.Contains(created.Body.String(), secret) {
		t.Fatal("create returned the Credential")
	}
	var got connector
	if err := json.Unmarshal(created.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ID == "" || got.Name != "Gateway" || got.ProviderType != "web_request" ||
		got.BaseURL != "https://example.com/extract?mode=fixture" || got.CredentialLabel != "Prod key" || got.CredentialSetAt == nil {
		t.Fatalf("created Connector: %+v", got)
	}

	var ciphertext []byte
	if err := pool.QueryRow(t.Context(), "SELECT credential_ciphertext FROM connectors WHERE id = $1", got.ID).Scan(&ciphertext); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(ciphertext, []byte(secret)) {
		t.Fatal("Credential stored in plaintext")
	}
	plain, err := box.Decrypt(ciphertext)
	if err != nil || string(plain) != padded {
		t.Fatal("stored Credential does not decrypt to the submitted bytes")
	}

	listed := request(t, handler, http.MethodGet, "/api/v1/connectors", "")
	var list struct{ Connectors []connector }
	if err := json.Unmarshal(listed.Body.Bytes(), &list); err != nil || listed.Code != http.StatusOK {
		t.Fatalf("list: %d %s", listed.Code, listed.Body.String())
	}
	if len(list.Connectors) != 1 || list.Connectors[0].ID != got.ID || list.Connectors[0].CredentialLabel != "Prod key" ||
		strings.Contains(listed.Body.String(), secret) {
		t.Fatalf("list: %s", listed.Body.String())
	}
}

func TestAPICreatesAzureDocumentIntelligenceConnector(t *testing.T) {
	handler, pool, box := newAPI(t)
	secret := rand.Text()
	body, err := json.Marshal(map[string]string{
		"name": " Azure OCR ", "providerType": " azure_document_intelligence ",
		"baseUrl":    " https://ocr.example.cognitiveservices.azure.com ",
		"credential": secret, "credentialLabel": "Azure key",
	})
	if err != nil {
		t.Fatal(err)
	}
	created := request(t, handler, http.MethodPost, "/api/v1/connectors", string(body))
	if created.Code != http.StatusCreated || strings.Contains(created.Body.String(), secret) {
		t.Fatalf("create: %d %s", created.Code, created.Body.String())
	}
	var got connector
	if err := json.Unmarshal(created.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ProviderType != "azure_document_intelligence" || got.BaseURL != "https://ocr.example.cognitiveservices.azure.com" ||
		got.APIVersion != "2024-11-30" {
		t.Fatalf("created Connector: %+v", got)
	}
	var providerType, apiVersion string
	var ciphertext []byte
	if err := pool.QueryRow(t.Context(), `
		SELECT provider_type, api_version, credential_ciphertext FROM connectors WHERE id = $1`, got.ID,
	).Scan(&providerType, &apiVersion, &ciphertext); err != nil {
		t.Fatal(err)
	}
	if providerType != "azure_document_intelligence" || apiVersion != "2024-11-30" {
		t.Fatalf("persisted settings: %s %s", providerType, apiVersion)
	}
	plain, err := box.Decrypt(ciphertext)
	if err != nil || string(plain) != secret {
		t.Fatal("stored Credential does not round-trip")
	}
}

func TestAPICreatesAConnectorWithoutACredential(t *testing.T) {
	handler, _, _ := newAPI(t)
	created := request(t, handler, http.MethodPost, "/api/v1/connectors", `{"name":"Local","providerType":"web_request","baseUrl":"http://127.0.0.1:9000"}`)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", created.Code, created.Body.String())
	}
	if strings.Contains(created.Body.String(), "credential") {
		t.Fatalf("Credential fields on a Connector without one: %s", created.Body.String())
	}
}

func TestAPIRejectsInvalidConnectorsWithoutInserting(t *testing.T) {
	handler, pool, _ := newAPI(t)
	valid := `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com"}`
	withURL := func(endpoint string) string { return strings.Replace(valid, "https://example.com", endpoint, 1) }
	for _, tc := range []struct{ name, body, contentType string }{
		{"missing_name", `{"providerType":"web_request","baseUrl":"https://example.com"}`, "application/json"},
		{"blank_name", strings.Replace(valid, "Fixture", "  ", 1), "application/json"},
		{"unsupported_provider", strings.Replace(valid, "web_request", "openai", 1), "application/json"},
		{"web_request_api_version", strings.TrimSuffix(valid, "}") + `,"apiVersion":"2024-11-30"}`, "application/json"},
		{"azure_without_credential", `{"name":"Azure","providerType":"azure_document_intelligence","baseUrl":"https://ocr.example.cognitiveservices.azure.com","credentialLabel":"key"}`, "application/json"},
		{"relative_url", withURL("/check"), "application/json"},
		{"wrong_scheme", withURL("ftp://example.com"), "application/json"},
		{"missing_host", withURL("https:///check"), "application/json"},
		{"missing_hostname", withURL("https://:443/check"), "application/json"},
		{"userinfo", withURL("https://user:credential-canary@example.com"), "application/json"},
		{"fragment", withURL("https://example.com/#credential-canary"), "application/json"},
		{"invalid_port", withURL("https://example.com:65536"), "application/json"},
		{"zero_port", withURL("https://example.com:0"), "application/json"},
		{"malformed_url", withURL("https://[credential-canary"), "application/json"},
		{"malformed_query", withURL("https://example.com/?mode=%ZZ"), "application/json"},
		{"query_api_key", withURL("https://example.com/?api_key=credential-canary"), "application/json"},
		{"query_token_any_case", withURL("https://example.com/?Token=credential-canary"), "application/json"},
		{"query_amz_signature", withURL("https://example.com/?X-Amz-Signature=credential-canary"), "application/json"},
		{"missing_label", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credential":"credential-canary"}`, "application/json"},
		{"blank_label", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credential":"credential-canary","credentialLabel":"  "}`, "application/json"},
		{"label_without_value", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credentialLabel":"Fixture label"}`, "application/json"},
		{"plaintext_credential", `{"name":"Fixture","providerType":"web_request","baseUrl":"http://example.com","credential":"credential-canary","credentialLabel":"Fixture label"}`, "application/json"},
		{"header_injection", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credential":"credential-canary\r\nInjected: yes","credentialLabel":"Fixture label"}`, "application/json"},
		{"null_field", strings.Replace(valid, `"Fixture"`, "null", 1), "application/json"},
		{"null_credential", strings.TrimSuffix(valid, "}") + `,"credential":null}`, "application/json"},
		{"number_field", strings.Replace(valid, `"Fixture"`, "42", 1), "application/json"},
		{"unknown_field", strings.TrimSuffix(valid, "}") + `,"id":"ignored"}`, "application/json"},
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
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/connectors", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", tc.contentType)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusBadRequest || strings.Contains(rec.Body.String(), "credential-canary") || !json.Valid(rec.Body.Bytes()) {
				t.Fatalf("unsafe or accepted invalid Connector: %d %s", rec.Code, rec.Body.String())
			}
			if n := countConnectors(t, pool); n != 0 {
				t.Fatalf("invalid Connector was inserted: %d rows", n)
			}
		})
	}
}

func TestAPIWrongMethod(t *testing.T) {
	handler, _, _ := newAPI(t)
	wrong := request(t, handler, http.MethodDelete, "/api/v1/connectors", "")
	if wrong.Code != http.StatusMethodNotAllowed || wrong.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unsupported method: %d", wrong.Code)
	}
}

func TestAPIDatabaseFailuresAndCancellationAreSafe(t *testing.T) {
	handler, pool, _ := newAPI(t)
	pool.Close()
	for _, tc := range []struct{ method, body string }{
		{http.MethodPost, `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com","credential":"credential-canary","credentialLabel":"Fixture label"}`},
		{http.MethodGet, ""},
	} {
		response := request(t, handler, tc.method, "/api/v1/connectors", tc.body)
		if response.Code != http.StatusServiceUnavailable || !json.Valid(response.Body.Bytes()) ||
			strings.Contains(response.Body.String(), "credential-canary") || strings.Contains(response.Body.String(), "closed") {
			t.Fatalf("database error exposed details: %d %s", response.Code, response.Body.String())
		}
	}

	handler, pool, _ = newAPI(t)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	req := httptest.NewRequestWithContext(ctx, http.MethodPost, "/api/v1/connectors", strings.NewReader(`{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable || countConnectors(t, pool) != 0 {
		t.Fatalf("canceled create reported success or inserted: %d %s", rec.Code, rec.Body.String())
	}
}

func TestAPIBoundsDatabaseWaits(t *testing.T) {
	handler, pool, _ := newAPI(t)
	tx, err := pool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.WithoutCancel(t.Context())) })
	if _, err := tx.Exec(t.Context(), "LOCK TABLE connectors IN ACCESS EXCLUSIVE MODE"); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	response := request(t, handler, http.MethodPost, "/api/v1/connectors", `{"name":"Fixture","providerType":"web_request","baseUrl":"https://example.com"}`)
	if response.Code != http.StatusServiceUnavailable || time.Since(started) > 7*time.Second {
		t.Fatalf("unbounded or successful blocked create: %d after %s", response.Code, time.Since(started))
	}
	if err := tx.Rollback(t.Context()); err != nil {
		t.Fatal(err)
	}
	if n := countConnectors(t, pool); n != 0 {
		t.Fatalf("timed-out create inserted: %d rows", n)
	}
}
