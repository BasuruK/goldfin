package api_test

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func createWebConnector(t *testing.T, handler http.Handler, body string) connector {
	t.Helper()
	created := request(t, handler, http.MethodPost, "/api/v1/connectors", body)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", created.Code, created.Body.String())
	}
	var got connector
	if err := json.Unmarshal(created.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	return got
}

func TestAPIUpdatesConnectorWithoutRotatingCredential(t *testing.T) {
	handler, pool, box := newAPI(t)
	secret := rand.Text()
	created := createWebConnector(t, handler, `{
		"name":"Gateway","providerType":"web_request","baseUrl":"https://example.com",
		"credential":"`+secret+`","credentialLabel":"Prod key"
	}`)
	var ciphertextBefore []byte
	var setAtBefore time.Time
	if err := pool.QueryRow(t.Context(), `
		SELECT credential_ciphertext, credential_set_at FROM connectors WHERE id = $1`, created.ID,
	).Scan(&ciphertextBefore, &setAtBefore); err != nil {
		t.Fatal(err)
	}
	body := `{"name":"Renamed","providerType":"web_request","baseUrl":"https://renamed.example"}`
	updated := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID, body)
	if updated.Code != http.StatusOK || strings.Contains(updated.Body.String(), secret) {
		t.Fatalf("update: %d %s", updated.Code, updated.Body.String())
	}
	var got connector
	if err := json.Unmarshal(updated.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Name != "Renamed" || got.BaseURL != "https://renamed.example" || got.CredentialLabel != "Prod key" {
		t.Fatalf("updated: %+v", got)
	}
	var ciphertextAfter []byte
	var setAtAfter time.Time
	if err := pool.QueryRow(t.Context(), `
		SELECT credential_ciphertext, credential_set_at FROM connectors WHERE id = $1`, created.ID,
	).Scan(&ciphertextAfter, &setAtAfter); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(ciphertextBefore, ciphertextAfter) || !setAtBefore.Equal(setAtAfter) {
		t.Fatal("Credential ciphertext or set time changed without rotation")
	}
	plain, err := box.Decrypt(ciphertextAfter)
	if err != nil || string(plain) != secret {
		t.Fatal("stored Credential does not round-trip after update")
	}
}

func TestAPIUpdatesConnectorCredential(t *testing.T) {
	handler, pool, box := newAPI(t)
	oldSecret := rand.Text()
	created := createWebConnector(t, handler, `{
		"name":"Gateway","providerType":"web_request","baseUrl":"https://example.com",
		"credential":"`+oldSecret+`","credentialLabel":"Old"
	}`)
	var setAtBefore time.Time
	if err := pool.QueryRow(t.Context(), `SELECT credential_set_at FROM connectors WHERE id = $1`, created.ID).Scan(&setAtBefore); err != nil {
		t.Fatal(err)
	}
	newSecret := rand.Text()
	updated := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID, `{
		"name":"Gateway","providerType":"web_request","baseUrl":"https://example.com",
		"credential":"`+newSecret+`","credentialLabel":"New"
	}`)
	if updated.Code != http.StatusOK || strings.Contains(updated.Body.String(), newSecret) {
		t.Fatalf("update: %d %s", updated.Code, updated.Body.String())
	}
	var got connector
	if err := json.Unmarshal(updated.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.CredentialLabel != "New" || got.CredentialSetAt == nil || !got.CredentialSetAt.After(setAtBefore) {
		t.Fatalf("updated metadata: %+v", got)
	}
	var ciphertext []byte
	if err := pool.QueryRow(t.Context(), `SELECT credential_ciphertext FROM connectors WHERE id = $1`, created.ID).Scan(&ciphertext); err != nil {
		t.Fatal(err)
	}
	plain, err := box.Decrypt(ciphertext)
	if err != nil || string(plain) != newSecret {
		t.Fatal("rotated Credential does not round-trip")
	}
}

func TestAPIUpdatesConnectorModels(t *testing.T) {
	handler, pool, _ := newAPI(t)
	created := createWebConnector(t, handler, `{
		"name":"LLM","providerType":"openai","baseUrl":"https://api.openai.com/v1",
		"credential":"secret","credentialLabel":"Prod","llmApiMode":"responses",
		"models":[{"id":"gpt-4o-mini","enabled":true},{"id":"gpt-4o","enabled":false}]
	}`)
	updated := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID, `{
		"name":"LLM","providerType":"openai","baseUrl":"https://api.openai.com/v1",
		"llmApiMode":"responses",
		"models":[{"id":"gpt-4o","enabled":true}]
	}`)
	if updated.Code != http.StatusOK {
		t.Fatalf("update: %d %s", updated.Code, updated.Body.String())
	}
	var got connector
	if err := json.Unmarshal(updated.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Models) != 1 || got.Models[0].ID != "gpt-4o" || !got.Models[0].Enabled {
		t.Fatalf("models: %+v", got.Models)
	}
	var count int
	if err := pool.QueryRow(t.Context(), `SELECT count(*) FROM connector_models WHERE connector_id = $1`, created.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("model rows: %d", count)
	}
}

func TestAPIUpdateRejectsOversizedBody(t *testing.T) {
	handler, _, _ := newAPI(t)
	created := createWebConnector(t, handler, `{"name":"A","providerType":"web_request","baseUrl":"https://example.com"}`)
	oversized := `{"name":"` + strings.Repeat("a", 64<<10) + `","providerType":"web_request","baseUrl":"https://example.com"}`
	resp := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID, oversized)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("update: %d %s", resp.Code, resp.Body.String())
	}
}

func TestAPIUpdateRejectsInvalidConnector(t *testing.T) {
	handler, _, _ := newAPI(t)
	created := createWebConnector(t, handler, `{"name":"A","providerType":"web_request","baseUrl":"https://example.com"}`)
	for _, tc := range []struct {
		name string
		id   string
		body string
		code int
	}{
		{"missing", created.ID + "-missing", `{"name":"A","providerType":"web_request","baseUrl":"https://example.com"}`, http.StatusNotFound},
		{"provider_change", created.ID, `{"name":"A","providerType":"openai","baseUrl":"https://example.com","credential":"x","credentialLabel":"L","models":[{"id":"gpt-4o","enabled":true}]}`, http.StatusBadRequest},
		{"unknown_field", created.ID, `{"name":"A","providerType":"web_request","baseUrl":"https://example.com","extra":true}`, http.StatusBadRequest},
		{"bad_url", created.ID, `{"name":"A","providerType":"web_request","baseUrl":"ftp://x"}`, http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			resp := request(t, handler, http.MethodPut, "/api/v1/connectors/"+tc.id, tc.body)
			if resp.Code != tc.code {
				t.Fatalf("status: %d %s", resp.Code, resp.Body.String())
			}
		})
	}
}

func TestAPIDeletesUnusedConnector(t *testing.T) {
	handler, pool, _ := newAPI(t)
	created := createWebConnector(t, handler, `{"name":"A","providerType":"web_request","baseUrl":"https://example.com"}`)
	deleted := request(t, handler, http.MethodDelete, "/api/v1/connectors/"+created.ID, "")
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", deleted.Code, deleted.Body.String())
	}
	listed := request(t, handler, http.MethodGet, "/api/v1/connectors", "")
	if listed.Code != http.StatusOK {
		t.Fatalf("list: %d %s", listed.Code, listed.Body.String())
	}
	var list struct{ Connectors []connector }
	if err := json.Unmarshal(listed.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Connectors) != 0 {
		t.Fatalf("list still has connector: %+v", list.Connectors)
	}
	if n := countConnectors(t, pool); n != 0 {
		t.Fatalf("rows: %d", n)
	}
}

func TestAPIDeleteRefusedWhenWorkflowReferencesConnector(t *testing.T) {
	handler, _, _ := newAPI(t)
	ocrID, llmID, promptID := seedOCRAndLLM(t, handler)
	wf := request(t, handler, http.MethodPost, "/api/v1/workflows", validWorkflowBody(ocrID, llmID, promptID))
	if wf.Code != http.StatusCreated {
		t.Fatalf("workflow: %d %s", wf.Code, wf.Body.String())
	}
	conflict := request(t, handler, http.MethodDelete, "/api/v1/connectors/"+ocrID, "")
	if conflict.Code != http.StatusConflict {
		t.Fatalf("delete: %d %s", conflict.Code, conflict.Body.String())
	}
	if !strings.Contains(conflict.Body.String(), "Workflow:") || !strings.Contains(conflict.Body.String(), "Invoices") {
		t.Fatalf("message: %s", conflict.Body.String())
	}
	listed := request(t, handler, http.MethodGet, "/api/v1/connectors", "")
	var list struct{ Connectors []connector }
	if err := json.Unmarshal(listed.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Connectors) != 2 {
		t.Fatalf("connector removed: %+v", list.Connectors)
	}
}

func TestAPIDeleteMissingConnector(t *testing.T) {
	handler, _, _ := newAPI(t)
	deleted := request(t, handler, http.MethodDelete, "/api/v1/connectors/does-not-exist", "")
	if deleted.Code != http.StatusNotFound {
		t.Fatalf("delete: %d %s", deleted.Code, deleted.Body.String())
	}
}

func TestAPIUpdateRejectsOrphanCredentialLabelOnCredentialLessConnector(t *testing.T) {
	handler, pool, _ := newAPI(t)
	created := createWebConnector(t, handler, `{"name":"A","providerType":"web_request","baseUrl":"https://example.com"}`)
	resp := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID,
		`{"name":"A","providerType":"web_request","baseUrl":"https://example.com","credentialLabel":"Orphan"}`)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("update: %d %s", resp.Code, resp.Body.String())
	}
	if n := countConnectors(t, pool); n != 1 {
		t.Fatalf("rows: %d", n)
	}
}

func TestAPIUpdateRejectsHTTPBaseURLWhenStoredCredentialExists(t *testing.T) {
	handler, _, _ := newAPI(t)
	secret := rand.Text()
	created := createWebConnector(t, handler, `{
		"name":"Gateway","providerType":"web_request","baseUrl":"https://example.com",
		"credential":"`+secret+`","credentialLabel":"Prod key"
	}`)
	resp := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID,
		`{"name":"Gateway","providerType":"web_request","baseUrl":"http://example.com"}`)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("update: %d %s", resp.Code, resp.Body.String())
	}
}

func TestAPIUpdateRejectsNULBytesInConnectorFields(t *testing.T) {
	handler, _, _ := newAPI(t)
	created := createWebConnector(t, handler, `{"name":"A","providerType":"web_request","baseUrl":"https://example.com"}`)
	for _, body := range []string{
		`{"name":"A\u0000B","providerType":"web_request","baseUrl":"https://example.com"}`,
		`{"name":"A","providerType":"web_request","baseUrl":"https://example.com","credentialLabel":"L\u0000"}`,
	} {
		resp := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID, body)
		if resp.Code != http.StatusBadRequest {
			t.Fatalf("update: %d %s", resp.Code, resp.Body.String())
		}
	}
	llm := createWebConnector(t, handler, `{
		"name":"LLM","providerType":"openai","baseUrl":"https://api.openai.com/v1",
		"credential":"secret","credentialLabel":"Prod","llmApiMode":"responses",
		"models":[{"id":"gpt-4o","enabled":true}]
	}`)
	resp := request(t, handler, http.MethodPut, "/api/v1/connectors/"+llm.ID, `{
		"name":"LLM","providerType":"openai","baseUrl":"https://api.openai.com/v1","llmApiMode":"responses",
		"models":[{"id":"gpt\u00004o","enabled":true}]
	}`)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("model id: %d %s", resp.Code, resp.Body.String())
	}
}

func TestAPIUpdateRotatesCredentialKeepingExistingLabel(t *testing.T) {
	handler, pool, box := newAPI(t)
	oldSecret := rand.Text()
	created := createWebConnector(t, handler, `{
		"name":"Gateway","providerType":"web_request","baseUrl":"https://example.com",
		"credential":"`+oldSecret+`","credentialLabel":"Prod key"
	}`)
	newSecret := rand.Text()
	updated := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID, `{
		"name":"Gateway","providerType":"web_request","baseUrl":"https://example.com",
		"credential":"`+newSecret+`"
	}`)
	if updated.Code != http.StatusOK {
		t.Fatalf("update: %d %s", updated.Code, updated.Body.String())
	}
	var got connector
	if err := json.Unmarshal(updated.Body.Bytes(), &got); err != nil || got.CredentialLabel != "Prod key" {
		t.Fatalf("label: %+v", got)
	}
	var ciphertext []byte
	if err := pool.QueryRow(t.Context(), `SELECT credential_ciphertext FROM connectors WHERE id = $1`, created.ID).Scan(&ciphertext); err != nil {
		t.Fatal(err)
	}
	plain, err := box.Decrypt(ciphertext)
	if err != nil || string(plain) != newSecret {
		t.Fatal("rotated Credential does not round-trip")
	}
}

func TestAPIUpdateRejectsCredentialWithoutLabelWhenNoneStored(t *testing.T) {
	handler, _, _ := newAPI(t)
	created := createWebConnector(t, handler, `{"name":"A","providerType":"web_request","baseUrl":"https://example.com"}`)
	resp := request(t, handler, http.MethodPut, "/api/v1/connectors/"+created.ID,
		`{"name":"A","providerType":"web_request","baseUrl":"https://example.com","credential":"secret"}`)
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("update: %d %s", resp.Code, resp.Body.String())
	}
}

func TestAPIDeleteListsMultipleWorkflowNames(t *testing.T) {
	handler, _, _ := newAPI(t)
	ocrID, _, _ := seedOCRAndLLM(t, handler)
	ocrOnly := func(name string) string {
		return `{"name":"` + name + `","nodes":[{"id":"n1","name":"OCR","connectorId":"` + ocrID + `","inputNodeIds":[]}]}`
	}
	for _, name := range []string{"Alpha", "Zebra"} {
		resp := request(t, handler, http.MethodPost, "/api/v1/workflows", ocrOnly(name))
		if resp.Code != http.StatusCreated {
			t.Fatalf("workflow %s: %d %s", name, resp.Code, resp.Body.String())
		}
	}
	conflict := request(t, handler, http.MethodDelete, "/api/v1/connectors/"+ocrID, "")
	if conflict.Code != http.StatusConflict {
		t.Fatalf("delete: %d %s", conflict.Code, conflict.Body.String())
	}
	if !strings.Contains(conflict.Body.String(), "Alpha, Zebra") {
		t.Fatalf("message: %s", conflict.Body.String())
	}
}

func TestAPIDeleteRemovesConnectorModels(t *testing.T) {
	handler, pool, _ := newAPI(t)
	created := createWebConnector(t, handler, `{
		"name":"LLM","providerType":"openai","baseUrl":"https://api.openai.com/v1",
		"credential":"secret","credentialLabel":"Prod","llmApiMode":"responses",
		"models":[{"id":"gpt-4o","enabled":true}]
	}`)
	deleted := request(t, handler, http.MethodDelete, "/api/v1/connectors/"+created.ID, "")
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", deleted.Code, deleted.Body.String())
	}
	var modelCount int
	if err := pool.QueryRow(t.Context(), `SELECT count(*) FROM connector_models WHERE connector_id = $1`, created.ID).Scan(&modelCount); err != nil {
		t.Fatal(err)
	}
	if modelCount != 0 {
		t.Fatalf("model rows left: %d", modelCount)
	}
}
