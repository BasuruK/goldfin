package probe_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const goldenPromptContent = "Extract invoice fields from the OCR text."

func assertNoLLMOutputSchema(t *testing.T, payload map[string]json.RawMessage) {
	t.Helper()
	for _, key := range []string{"response_format", "json_schema"} {
		if _, ok := payload[key]; ok {
			t.Fatalf("forbidden top-level key %q in LLM request", key)
		}
	}
	if raw, ok := payload["text"]; ok {
		var text map[string]json.RawMessage
		if json.Unmarshal(raw, &text) == nil {
			if _, ok := text["format"]; ok {
				t.Fatal("forbidden text.format in LLM request")
			}
		}
	}
}

// TestWorkflowGoldenExtraction is the ADR 0014 walking-skeleton extraction test: one real
// Document, recorded provider responses, full save + probe stack, known displayed output.
func TestWorkflowGoldenExtraction(t *testing.T) {
	document := azureFixture(t, "invoice.docx")
	wantOCR := string(azureFixture(t, "content.txt"))
	running := azureFixture(t, "running.json")
	succeeded := azureFixture(t, "succeeded.json")
	const wantLLM = "extracted"

	var gotOCRBytes []byte
	ocrCalls := 0
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if strings.Contains(r.URL.Host, "ocr.example") {
			ocrCalls++
			if r.Method == http.MethodPost && strings.Contains(r.URL.Path, ":analyze") {
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Fatal(err)
				}
				gotOCRBytes = append([]byte(nil), body...)
				if r.Header.Get("Content-Type") != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" {
					t.Fatalf("OCR Content-Type: %q", r.Header.Get("Content-Type"))
				}
				res := response(http.StatusAccepted, nil)
				res.Header.Set("Operation-Location", testOperationURL)
				return res, nil
			}
			if ocrCalls == 2 {
				return response(http.StatusOK, running), nil
			}
			return response(http.StatusOK, succeeded), nil
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			t.Fatal("LLM request JSON")
		}
		assertNoLLMOutputSchema(t, payload)
		var instructions string
		if err := json.Unmarshal(payload["instructions"], &instructions); err != nil || instructions != goldenPromptContent {
			t.Fatalf("instructions not verbatim: err=%v got=%q", err, instructions)
		}
		return response(http.StatusOK, []byte(testLLMSuccessBody)), nil
	})

	h := newHandler(t, transport)
	ocrID := createAzureConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, wantVersion := createPrompt(t, h, "Golden", goldenPromptContent)
	if wantVersion != 1 {
		t.Fatalf("want first Prompt version 1, got %d", wantVersion)
	}
	wfID := createWorkflow(t, h, linearWorkflowBody(ocrID, llmID, promptID, ""))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document,
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
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
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.WorkflowID != wfID || len(got.Nodes) != 2 {
		t.Fatalf("response shape: workflowId=%q nodes=%d", got.WorkflowID, len(got.Nodes))
	}
	if !bytes.Equal(gotOCRBytes, document) {
		t.Fatal("OCR provider did not receive the real Document bytes")
	}

	ocr := got.Nodes[0]
	if ocr.NodeID != "ocr" || ocr.Kind != "ocr" || ocr.Status != "completed" || ocr.Text != wantOCR {
		t.Fatalf("OCR node: %+v", ocr)
	}
	llm := got.Nodes[1]
	if llm.NodeID != "llm" || llm.Kind != "llm" || llm.Status != "completed" || llm.Text != wantLLM {
		t.Fatalf("LLM node: %+v", llm)
	}
	if llm.PromptVersion == nil || *llm.PromptVersion != 1 {
		t.Fatalf("promptVersion: %+v", llm.PromptVersion)
	}
}

func TestWorkflowGoldenIncompleteLLMNoRescue(t *testing.T) {
	document := azureFixture(t, "invoice.docx")
	running := azureFixture(t, "running.json")
	succeeded := azureFixture(t, "succeeded.json")
	incompleteBody := `{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"partial"}]}]}`

	ocrCalls := 0
	llmCalls := 0
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
		llmCalls++
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatal(err)
		}
		var payload map[string]json.RawMessage
		if json.Unmarshal(body, &payload) != nil {
			t.Fatal("LLM request JSON")
		}
		assertNoLLMOutputSchema(t, payload)
		return response(http.StatusOK, []byte(incompleteBody)), nil
	})

	h := newHandler(t, transport)
	ocrID := createAzureConnector(t, h)
	llmID := createOpenAIConnector(t, h)
	promptID, _ := createPrompt(t, h, "Golden incomplete", goldenPromptContent)
	wfID := createWorkflow(t, h, linearWorkflowBody(ocrID, llmID, promptID, ""))

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, workflowProbeRequest(t, wfID, document,
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
	if rec.Code != http.StatusOK {
		t.Fatalf("probe: %d %s", rec.Code, rec.Body.String())
	}
	if llmCalls != 1 {
		t.Fatalf("LLM called %d times; want exactly one call without retry", llmCalls)
	}

	var got struct {
		Nodes []struct {
			NodeID     string `json:"nodeId"`
			Kind       string `json:"kind"`
			Status     string `json:"status"`
			StopReason string `json:"stopReason"`
			Text       string `json:"text"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got.Nodes) != 2 {
		t.Fatal(err)
	}
	if got.Nodes[0].NodeID != "ocr" || got.Nodes[0].Status != "completed" {
		t.Fatalf("OCR node: %+v", got.Nodes[0])
	}
	llm := got.Nodes[1]
	if llm.NodeID != "llm" || llm.Kind != "llm" || llm.Status != "incomplete" ||
		llm.StopReason != "max_output_tokens" || llm.Text != "partial" {
		t.Fatalf("incomplete LLM node: %+v", llm)
	}
}
