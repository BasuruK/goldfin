package probe_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/BasuruK/goldfin/internal/handler"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/testdb"
	"github.com/jackc/pgx/v5/pgxpool"
)

const foundryOCRBody = `{"pages":[{"markdown":"foundry text"}]}`

func foundryHost(r *http.Request) bool {
	return strings.Contains(r.URL.Host, "foundry")
}

func newHandlerWithPool(t *testing.T, transport http.RoundTripper) (http.Handler, *pgxpool.Pool) {
	t.Helper()
	pool, db := testdb.New(t)
	testdb.MigrateUp(t, t.Context(), db)
	box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	return handler.New(pool, box, transport), pool
}

func workflowProbeRequest(t *testing.T, workflowID string, document []byte, mime string) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", `form-data; name="document"; filename="fixture.docx"`)
	header.Set("Content-Type", mime)
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(document); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/workflows/"+workflowID+"/probe", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.ContentLength = int64(buf.Len())
	return req
}

func createWorkflow(t *testing.T, h http.Handler, body string) string {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/workflows", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create Workflow: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || created.ID == "" {
		t.Fatalf("created Workflow: %s", rec.Body.String())
	}
	return created.ID
}

func linearWorkflowBody(ocrID, llmID, promptID, ocrModel string) string {
	ocrNode := `{"id":"ocr","name":"Scan","connectorId":"` + ocrID + `","inputNodeIds":[]}`
	if ocrModel != "" {
		ocrNode = `{"id":"ocr","name":"Scan","connectorId":"` + ocrID + `","modelId":"` + ocrModel + `","inputNodeIds":[]}`
	}
	return `{"name":"Linear","nodes":[` + ocrNode + `,
		{"id":"llm","name":"Extract","connectorId":"` + llmID + `","modelId":"` + testLLMModel + `","promptId":"` + promptID + `","inputNodeIds":["ocr"]}
	]}`
}

func TestWorkflowProbeLinearAzureOCRToLLM(t *testing.T) {
	document := azureFixture(t, "invoice.docx")
	running := azureFixture(t, "running.json")
	succeeded := azureFixture(t, "succeeded.json")
	wantOCR := string(azureFixture(t, "content.txt"))
	ocrCalls := 0
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Host, "ocr.example") {
			ocrCalls++
			if ocrCalls == 1 {
				res := response(http.StatusAccepted, nil)
				res.Header.Set("Operation-Location", testOperationURL)
				return res, nil
			}
			if ocrCalls == 2 {
				return response(http.StatusOK, running), nil
			}
			return response(http.StatusOK, succeeded), nil
		}
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	})
	h := newHandler(t, transport)
	ocrID := createAzureConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, wantVersion := createPrompt(t, h, "Extract", "Extract fields.")
	wfID := createWorkflow(t, h, linearWorkflowBody(ocrID, llmID, promptID, ""))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe: %d %s", rec.Code, rec.Body.String())
	}
	var got struct {
		WorkflowID string `json:"workflowId"`
		Nodes      []struct {
			NodeID        string `json:"nodeId"`
			Kind          string `json:"kind"`
			Status        string `json:"status"`
			Text          string `json:"text"`
			PromptVersion *int   `json:"promptVersion"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || got.WorkflowID != wfID || len(got.Nodes) != 2 {
		t.Fatalf("response: %+v err=%v", got, err)
	}
	if got.Nodes[0].NodeID != "ocr" || got.Nodes[0].Kind != "ocr" || got.Nodes[0].Status != "completed" || got.Nodes[0].Text != wantOCR {
		t.Fatalf("OCR node: %+v", got.Nodes[0])
	}
	if got.Nodes[1].NodeID != "llm" || got.Nodes[1].Kind != "llm" || got.Nodes[1].Status != "completed" {
		t.Fatalf("LLM node: %+v", got.Nodes[1])
	}
	if got.Nodes[1].PromptVersion == nil || *got.Nodes[1].PromptVersion != wantVersion {
		t.Fatalf("promptVersion: %+v", got.Nodes[1].PromptVersion)
	}
}

func TestWorkflowProbeLinearFoundryOCRToLLM(t *testing.T) {
	document := syntheticPDFDocument()
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if foundryHost(r) {
			return response(http.StatusOK, []byte(foundryOCRBody)), nil
		}
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	})
	h := newHandler(t, transport)
	ocrID := createFoundryConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, _ := createPrompt(t, h, "P", "body")
	wfID := createWorkflow(t, h, linearWorkflowBody(ocrID, llmID, promptID, testFoundryModel))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document, "application/pdf"))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe: %d %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Nodes []struct {
			Status string `json:"status"`
			Text   string `json:"text"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got.Nodes) != 2 {
		t.Fatal(err)
	}
	if got.Nodes[0].Status != "completed" || got.Nodes[0].Text != "foundry text" {
		t.Fatalf("foundry OCR: %+v", got.Nodes[0])
	}
}

func TestWorkflowProbeFanInJoinsInInputOrder(t *testing.T) {
	document := syntheticPDFDocument()
	ocrResponses := []string{"alpha", "beta"}
	ocrIdx := 0
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if foundryHost(r) {
			body := fmt.Sprintf(`{"pages":[{"markdown":%q}]}`, ocrResponses[ocrIdx])
			ocrIdx++
			return response(http.StatusOK, []byte(body)), nil
		}
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(raw, &payload) != nil {
			t.Fatal("LLM payload")
		}
		var input string
		if json.Unmarshal(payload["input"], &input) != nil {
			t.Fatal("input field")
		}
		want := "## First\nalpha\n\n## Second\nbeta"
		if input != want {
			t.Fatalf("fan-in input:\n got %q\nwant %q", input, want)
		}
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	})
	h := newHandler(t, transport)
	ocrID := createFoundryConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, _ := createPrompt(t, h, "P", "body")
	wfID := createWorkflow(t, h, `{"name":"Fan-in","nodes":[
		{"id":"a","name":"First","connectorId":"`+ocrID+`","modelId":"`+testFoundryModel+`","inputNodeIds":[]},
		{"id":"b","name":"Second","connectorId":"`+ocrID+`","modelId":"`+testFoundryModel+`","inputNodeIds":[]},
		{"id":"join","name":"Join","connectorId":"`+llmID+`","modelId":"`+testLLMModel+`","promptId":"`+promptID+`","inputNodeIds":["a","b"]}
	]}`)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document, "application/pdf"))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe: %d %s", rec.Code, rec.Body.String())
	}
}

func TestWorkflowProbeMultipleRootOCRNodesShareDocument(t *testing.T) {
	document := syntheticPDFDocument()
	foundryCalls := 0
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if foundryHost(r) {
			foundryCalls++
			return response(http.StatusOK, []byte(`{"pages":[{"markdown":"x"}]}`)), nil
		}
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	})
	h := newHandler(t, transport)
	ocrID := createFoundryConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, _ := createPrompt(t, h, "P", "body")
	wfID := createWorkflow(t, h, `{"name":"Multi-root","nodes":[
		{"id":"r1","name":"R1","connectorId":"`+ocrID+`","modelId":"`+testFoundryModel+`","inputNodeIds":[]},
		{"id":"r2","name":"R2","connectorId":"`+ocrID+`","modelId":"`+testFoundryModel+`","inputNodeIds":[]},
		{"id":"l","name":"L","connectorId":"`+llmID+`","modelId":"`+testLLMModel+`","promptId":"`+promptID+`","inputNodeIds":["r1","r2"]}
	]}`)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document, "application/pdf"))
	if rec.Code != http.StatusOK || foundryCalls != 2 {
		t.Fatalf("probe: %d calls=%d %s", rec.Code, foundryCalls, rec.Body.String())
	}
}

func TestWorkflowProbeIncompleteLLMContinuesDownstream(t *testing.T) {
	document := syntheticPDFDocument()
	incompleteBody := `{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"partial"}]}]}`
	llmCalls := 0
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if foundryHost(r) {
			return response(http.StatusOK, []byte(`{"pages":[{"markdown":"ocr"}]}`)), nil
		}
		llmCalls++
		if llmCalls == 1 {
			return response(http.StatusOK, []byte(incompleteBody)), nil
		}
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	})
	h := newHandler(t, transport)
	ocrID := createFoundryConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, _ := createPrompt(t, h, "P1", "one")
	promptID2, _ := createPrompt(t, h, "P2", "two")
	wfID := createWorkflow(t, h, `{"name":"Incomplete","nodes":[
		{"id":"o","name":"O","connectorId":"`+ocrID+`","modelId":"`+testFoundryModel+`","inputNodeIds":[]},
		{"id":"l1","name":"L1","connectorId":"`+llmID+`","modelId":"`+testLLMModel+`","promptId":"`+promptID+`","inputNodeIds":["o"]},
		{"id":"l2","name":"L2","connectorId":"`+llmID+`","modelId":"`+testLLMModel+`","promptId":"`+promptID2+`","inputNodeIds":["l1"]}
	]}`)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document, "application/pdf"))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe: %d %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Nodes []struct {
			NodeID     string `json:"nodeId"`
			Status     string `json:"status"`
			StopReason string `json:"stopReason"`
			Text       string `json:"text"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got.Nodes) != 3 {
		t.Fatal(err)
	}
	if got.Nodes[1].Status != "incomplete" || got.Nodes[1].Text != "partial" || got.Nodes[1].StopReason != "max_output_tokens" {
		t.Fatalf("incomplete node: %+v", got.Nodes[1])
	}
	if got.Nodes[2].Status != "completed" || llmCalls != 2 {
		t.Fatalf("downstream: %+v llmCalls=%d", got.Nodes[2], llmCalls)
	}
}

func TestWorkflowProbeFailFastPreservesCompletedNodes(t *testing.T) {
	document := syntheticPDFDocument()
	llmCalled := false
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if foundryHost(r) {
			return response(http.StatusOK, []byte(`{"pages":[{"markdown":"ok"}]}`)), nil
		}
		llmCalled = true
		return response(http.StatusInternalServerError, []byte(`{"error":"fail"}`)), nil
	})
	h := newHandler(t, transport)
	ocrID := createFoundryConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, _ := createPrompt(t, h, "P", "body")
	wfID := createWorkflow(t, h, linearWorkflowBody(ocrID, llmID, promptID, testFoundryModel))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document, "application/pdf"))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe: %d %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Nodes []struct {
			NodeID string `json:"nodeId"`
			Status string `json:"status"`
			Text   string `json:"text"`
			Error  string `json:"error"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got.Nodes) != 2 {
		t.Fatal(err)
	}
	if got.Nodes[0].Status != "completed" || got.Nodes[0].Text != "ok" {
		t.Fatalf("completed: %+v", got.Nodes[0])
	}
	if got.Nodes[1].Status != "failed" || got.Nodes[1].Text != "" || got.Nodes[1].Error == "" || !llmCalled {
		t.Fatalf("failed node: %+v llmCalled=%v", got.Nodes[1], llmCalled)
	}
}

func TestWorkflowProbeDisabledModelFailsClosed(t *testing.T) {
	document := syntheticPDFDocument()
	transport := roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("provider should not be called")
		return nil, nil
	})
	h, pool := newHandlerWithPool(t, transport)
	ocrID := createFoundryConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, _ := createPrompt(t, h, "P", "body")
	wfID := createWorkflow(t, h, linearWorkflowBody(ocrID, llmID, promptID, testFoundryModel))
	if _, err := pool.Exec(t.Context(), `UPDATE connector_models SET enabled = false WHERE model_id = $1`, testFoundryModel); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document, "application/pdf"))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe: %d %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Nodes []struct {
			Status string `json:"status"`
			Error  string `json:"error"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got.Nodes) != 1 {
		t.Fatal(err)
	}
	if got.Nodes[0].Status != "failed" || !strings.Contains(got.Nodes[0].Error, "not enabled") {
		t.Fatalf("failed closed: %+v", got.Nodes[0])
	}
}

func TestWorkflowProbeResolvesLatestPromptVersion(t *testing.T) {
	document := syntheticPDFDocument()
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if foundryHost(r) {
			return response(http.StatusOK, []byte(`{"pages":[{"markdown":"t"}]}`)), nil
		}
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	})
	h := newHandler(t, transport)
	ocrID := createFoundryConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, _ := createPrompt(t, h, "Versioned", "v1")
	_, v2 := createPromptVersion(t, h, promptID, "v2 content")
	wfID := createWorkflow(t, h, linearWorkflowBody(ocrID, llmID, promptID, testFoundryModel))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document, "application/pdf"))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe: %d %s", rec.Code, rec.Body.String())
	}
	var got struct {
		Nodes []struct {
			NodeID        string `json:"nodeId"`
			PromptVersion *int   `json:"promptVersion"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got.Nodes) != 2 {
		t.Fatal(err)
	}
	if got.Nodes[1].PromptVersion == nil || *got.Nodes[1].PromptVersion != v2 {
		t.Fatalf("want latest version %d got %v", v2, got.Nodes[1].PromptVersion)
	}
}

func TestWorkflowProbeMissingWorkflow404(t *testing.T) {
	h := newHandler(t, roundTripFunc(func(*http.Request) (*http.Response, error) {
		return response(http.StatusOK, nil), nil
	}))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, "00000000-0000-4000-8000-000000000001", syntheticPDFDocument(), "application/pdf"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("404: %d %s", rec.Code, rec.Body.String())
	}
}

func createPromptVersion(t *testing.T, h http.Handler, promptID, content string) (string, int) {
	t.Helper()
	payload, err := json.Marshal(map[string]string{"content": content})
	if err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/v1/prompts/"+promptID+"/versions", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("version: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		LatestVersion *struct {
			Version int `json:"version"`
		} `json:"latestVersion"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil || created.LatestVersion == nil {
		t.Fatalf("version response: %s", rec.Body.String())
	}
	return promptID, created.LatestVersion.Version
}
