package probe_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"github.com/BasuruK/goldfin/internal/probe"
)

const (
	testLLMBaseURL       = "https://llm.example.test/v1"
	testLLMCredential    = "synthetic-llm-Credential" // #nosec G101 -- fixture Credential with no provider access.
	testLLMModel         = "gpt-test"
	testLLMDisabledModel = "gpt-disabled"
	testLLMSuccessBody   = `{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"extracted"}]}]}`
)

func createOpenAIConnector(t *testing.T, h http.Handler) string {
	t.Helper()
	body := `{"name":"Fixture LLM","providerType":"openai","baseUrl":"` + testLLMBaseURL + `","credential":"` + testLLMCredential + `","credentialLabel":"Fixture key","llmApiMode":"responses","models":[{"id":"` + testLLMModel + `","enabled":true},{"id":"` + testLLMDisabledModel + `","enabled":false}]}`
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/connectors", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create LLM Connector: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || created.ID == "" {
		t.Fatalf("created Connector: %s", rec.Body.String())
	}
	return created.ID
}

func createPrompt(t *testing.T, h http.Handler, name, content string) (promptID string, version int) {
	t.Helper()
	payload, err := json.Marshal(map[string]string{"name": name, "content": content})
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/prompts", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create Prompt: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID            string `json:"id"`
		LatestVersion *struct {
			Version int `json:"version"`
		} `json:"latestVersion"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || created.ID == "" || created.LatestVersion == nil {
		t.Fatalf("created Prompt: %s", rec.Body.String())
	}
	return created.ID, created.LatestVersion.Version
}

func llmRequest(t *testing.T, connectorID, modelID, input string, promptID *string) *http.Request {
	t.Helper()
	payload := map[string]any{
		"connectorId": connectorID,
		"modelId":     modelID,
		"input":       input,
	}
	if promptID != nil {
		payload["promptId"] = *promptID
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/probes/llm", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.ContentLength = int64(len(body))
	return req
}

func TestLLMProbeRunsSavedConnectorAndPromptWithVersion(t *testing.T) {
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "Bearer "+testLLMCredential {
			t.Error("Authorization header")
		}
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	})
	h := newHandler(t, transport)
	connectorID := createOpenAIConnector(t, h)
	promptID, wantVersion := createPrompt(t, h, "Invoices", "Extract totals.")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, llmRequest(t, connectorID, testLLMModel, "document text", &promptID))
	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("LLM: %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), testLLMCredential) {
		t.Fatal("LLM response leaked the Credential")
	}
	var got struct {
		Content       string `json:"content"`
		PromptVersion *struct {
			Version int    `json:"version"`
			Content string `json:"content"`
		} `json:"promptVersion"`
		Usage *struct{} `json:"usage"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Content != "extracted" || got.PromptVersion == nil || got.PromptVersion.Version != wantVersion ||
		got.PromptVersion.Content != "Extract totals." {
		t.Fatalf("LLM result: %+v", got)
	}
}

func TestLLMProbeRejectsDisabledModelBeforeProviderCall(t *testing.T) {
	calls := 0
	h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	}))
	connectorID := createOpenAIConnector(t, h)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, llmRequest(t, connectorID, testLLMDisabledModel, "in", nil))
	if rec.Code != http.StatusBadRequest || calls != 0 {
		t.Fatalf("disabled model: %d calls=%d %s", rec.Code, calls, rec.Body.String())
	}
}

func TestLLMProbeRejectsUnknownPromptAndRunsWithoutOne(t *testing.T) {
	t.Run("unknown_prompt", func(t *testing.T) {
		h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
			t.Fatal("unknown Prompt reached the provider")
			return nil, nil
		}))
		connectorID := createOpenAIConnector(t, h)
		unknown := "00000000-0000-4000-8000-000000000001"
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, llmRequest(t, connectorID, testLLMModel, "in", &unknown))
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("unknown Prompt: %d %s", rec.Code, rec.Body.String())
		}
	})
	t.Run("absent_prompt", func(t *testing.T) {
		var sawInstructions bool
		h := newHandler(t, roundTripFunc(func(r *http.Request) (*http.Response, error) {
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatal(err)
			}
			var payload map[string]json.RawMessage
			if json.Unmarshal(body, &payload) != nil {
				t.Fatal("request JSON")
			}
			_, sawInstructions = payload["instructions"]
			return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
		}))
		connectorID := createOpenAIConnector(t, h)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, llmRequest(t, connectorID, testLLMModel, "in", nil))
		if rec.Code != http.StatusOK || sawInstructions {
			t.Fatalf("absent Prompt: %d instructions=%v %s", rec.Code, sawInstructions, rec.Body.String())
		}
		var got struct {
			PromptVersion *struct{} `json:"promptVersion"`
		}
		if json.Unmarshal(rec.Body.Bytes(), &got) != nil || got.PromptVersion != nil {
			t.Fatalf("promptVersion should be null: %s", rec.Body.String())
		}
	})
}

func TestLLMProbeRejectsWrongConnectorKind(t *testing.T) {
	h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("wrong Connector reached the provider")
		return nil, nil
	}))
	for _, id := range []string{createWebConnector(t, h), createAzureConnector(t, h)} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, llmRequest(t, id, testLLMModel, "in", nil))
		if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "Invalid LLM request.") {
			t.Fatalf("wrong Connector %s: %d %s", id, rec.Code, rec.Body.String())
		}
	}
}

func TestLLMProbeMapsProvider429(t *testing.T) {
	h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusTooManyRequests, []byte(`{"error":{"message":"rate limited"}}`)), nil
	}))
	connectorID := createOpenAIConnector(t, h)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, llmRequest(t, connectorID, testLLMModel, "in", nil))
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "LLM Connector returned HTTP 429.") {
		t.Fatalf("429 mapping: %d %s", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "rate limited") {
		t.Fatal("provider body leaked into response")
	}
}

func TestLLMProbeRejectsOversizeBodyAndEmptyInput(t *testing.T) {
	h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid request reached the provider")
		return nil, nil
	}))
	connectorID := createOpenAIConnector(t, h)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, llmRequest(t, connectorID, testLLMModel, "   ", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty input: %d %s", rec.Code, rec.Body.String())
	}
	oversize := strings.Repeat("x", probe.MaxLLMBodyBytes+1)
	rec = httptest.NewRecorder()
	payload := `{"connectorId":"` + connectorID + `","modelId":"` + testLLMModel + `","input":"` + oversize + `"}`
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/probes/llm", strings.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.ContentLength = int64(len(payload))
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize body: %d %s", rec.Code, rec.Body.String())
	}
}

func TestLLMProbeOutlivesConnectorDatabaseGuard(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		start := time.Now()
		h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
			time.Sleep(6 * time.Second)
			return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
		}))
		connectorID := createOpenAIConnector(t, h)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, llmRequest(t, connectorID, testLLMModel, "in", nil))
		if rec.Code != http.StatusOK || time.Since(start) < 6*time.Second {
			t.Fatalf("LLM was cut off by the short Connector guard: %d after %s", rec.Code, time.Since(start))
		}
	})
}
