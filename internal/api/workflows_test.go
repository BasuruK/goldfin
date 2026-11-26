package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

type wfNode struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	ConnectorID  string   `json:"connectorId"`
	ModelID      string   `json:"modelId,omitempty"`
	PromptID     string   `json:"promptId,omitempty"`
	InputNodeIDs []string `json:"inputNodeIds"`
}

type workflowItem struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Nodes     []wfNode `json:"nodes"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

func seedOCRAndLLM(t *testing.T, handler http.Handler) (ocrID, llmID, promptID string) {
	t.Helper()
	ocr := request(t, handler, http.MethodPost, "/api/v1/connectors", `{
		"name":"OCR","providerType":"azure_document_intelligence",
		"baseUrl":"https://ocr.example.cognitiveservices.azure.com",
		"credential":"secret","credentialLabel":"key"
	}`)
	var ocrConn connector
	if err := json.Unmarshal(ocr.Body.Bytes(), &ocrConn); err != nil {
		t.Fatal(err)
	}
	llm := request(t, handler, http.MethodPost, "/api/v1/connectors", `{
		"name":"LLM","providerType":"openai",
		"baseUrl":"https://api.openai.com/v1",
		"credential":"secret","credentialLabel":"key",
		"llmApiMode":"responses",
		"models":[{"id":"gpt-4o","enabled":true}]
	}`)
	var llmConn connector
	if err := json.Unmarshal(llm.Body.Bytes(), &llmConn); err != nil {
		t.Fatal(err)
	}
	promptResp := request(t, handler, http.MethodPost, "/api/v1/prompts", `{"name":"Extract","content":"body"}`)
	var saved prompt
	if err := json.Unmarshal(promptResp.Body.Bytes(), &saved); err != nil {
		t.Fatal(err)
	}
	return ocrConn.ID, llmConn.ID, saved.ID
}

func validWorkflowBody(ocrID, llmID, promptID string) string {
	return `{
		"name":" Invoices ",
		"nodes":[
			{"id":"n1","name":"OCR","connectorId":"` + ocrID + `","inputNodeIds":[]},
			{"id":"n2","name":"Extract","connectorId":"` + llmID + `","modelId":"gpt-4o","promptId":"` + promptID + `","inputNodeIds":["n1"]}
		]
	}`
}

func TestAPICreatesWorkflow(t *testing.T) {
	handler, _, _ := newAPI(t)
	ocrID, llmID, promptID := seedOCRAndLLM(t, handler)
	created := request(t, handler, http.MethodPost, "/api/v1/workflows", validWorkflowBody(ocrID, llmID, promptID))
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", created.Code, created.Body.String())
	}
	var got workflowItem
	if err := json.Unmarshal(created.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ID == "" || got.Name != "Invoices" || len(got.Nodes) != 2 {
		t.Fatalf("created: %+v", got)
	}
}

func TestAPIListsAndGetsWorkflow(t *testing.T) {
	handler, _, _ := newAPI(t)
	ocrID, llmID, promptID := seedOCRAndLLM(t, handler)
	created := request(t, handler, http.MethodPost, "/api/v1/workflows", validWorkflowBody(ocrID, llmID, promptID))
	var first workflowItem
	if err := json.Unmarshal(created.Body.Bytes(), &first); err != nil {
		t.Fatal(err)
	}
	listed := request(t, handler, http.MethodGet, "/api/v1/workflows", "")
	var list struct {
		Workflows []workflowItem `json:"workflows"`
	}
	if err := json.Unmarshal(listed.Body.Bytes(), &list); err != nil || listed.Code != http.StatusOK || len(list.Workflows) != 1 {
		t.Fatalf("list: %d %s", listed.Code, listed.Body.String())
	}
	got := request(t, handler, http.MethodGet, "/api/v1/workflows/"+first.ID, "")
	var one workflowItem
	if err := json.Unmarshal(got.Body.Bytes(), &one); err != nil || got.Code != http.StatusOK || one.ID != first.ID {
		t.Fatalf("get: %d %s", got.Code, got.Body.String())
	}
}

func TestAPIUpdatesAndDeletesWorkflow(t *testing.T) {
	handler, _, _ := newAPI(t)
	ocrID, llmID, promptID := seedOCRAndLLM(t, handler)
	created := request(t, handler, http.MethodPost, "/api/v1/workflows", validWorkflowBody(ocrID, llmID, promptID))
	var first workflowItem
	if err := json.Unmarshal(created.Body.Bytes(), &first); err != nil {
		t.Fatal(err)
	}
	updated := request(t, handler, http.MethodPut, "/api/v1/workflows/"+first.ID, `{
		"name":"Receipts",
		"nodes":[
			{"id":"n1","name":"OCR","connectorId":"`+ocrID+`"},
			{"id":"n2","name":"Extract","connectorId":"`+llmID+`","modelId":"gpt-4o","promptId":"`+promptID+`","inputNodeIds":["n1"]}
		]
	}`)
	if updated.Code != http.StatusOK {
		t.Fatalf("update: %d %s", updated.Code, updated.Body.String())
	}
	var saved workflowItem
	if err := json.Unmarshal(updated.Body.Bytes(), &saved); err != nil || saved.Name != "Receipts" {
		t.Fatalf("updated: %+v", saved)
	}
	deleted := request(t, handler, http.MethodDelete, "/api/v1/workflows/"+first.ID, "")
	if deleted.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", deleted.Code, deleted.Body.String())
	}
	missing := request(t, handler, http.MethodGet, "/api/v1/workflows/"+first.ID, "")
	if missing.Code != http.StatusNotFound {
		t.Fatalf("after delete: %d", missing.Code)
	}
}

func TestAPIRejectsInvalidWorkflow(t *testing.T) {
	handler, pool, _ := newAPI(t)
	ocrID, llmID, promptID := seedOCRAndLLM(t, handler)
	cases := []struct {
		name string
		body string
	}{
		{"empty_name", `{"name":"  ","nodes":[{"id":"n1","name":"OCR","connectorId":"` + ocrID + `"}]}`},
		{"cycle", `{"name":"W","nodes":[
			{"id":"a","name":"A","connectorId":"` + llmID + `","modelId":"gpt-4o","promptId":"` + promptID + `","inputNodeIds":["b"]},
			{"id":"b","name":"B","connectorId":"` + llmID + `","modelId":"gpt-4o","promptId":"` + promptID + `","inputNodeIds":["a"]}
		]}`},
		{"ocr_with_inputs", `{"name":"W","nodes":[
			{"id":"a","name":"A","connectorId":"` + ocrID + `","inputNodeIds":["b"]},
			{"id":"b","name":"B","connectorId":"` + ocrID + `"}
		]}`},
		{"llm_without_inputs", `{"name":"W","nodes":[
			{"id":"a","name":"LLM","connectorId":"` + llmID + `","modelId":"gpt-4o","promptId":"` + promptID + `","inputNodeIds":[]}
		]}`},
		{"missing_connector", `{"name":"W","nodes":[{"id":"n1","name":"OCR","connectorId":"missing"}]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := request(t, handler, http.MethodPost, "/api/v1/workflows", tc.body)
			var got map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || rec.Code != http.StatusBadRequest || got["message"] != "Invalid Workflow." {
				t.Fatalf("got %d %s", rec.Code, rec.Body.String())
			}
		})
	}
	var n int
	if err := pool.QueryRow(t.Context(), "SELECT count(*) FROM workflows").Scan(&n); err != nil || n != 0 {
		t.Fatalf("invalid inserts: %d err=%v", n, err)
	}
}

func TestAPIWorkflowNotFound(t *testing.T) {
	handler, _, _ := newAPI(t)
	ocrID, llmID, promptID := seedOCRAndLLM(t, handler)
	putBody := validWorkflowBody(ocrID, llmID, promptID)
	for _, tc := range []struct {
		method string
		body   string
	}{
		{http.MethodGet, ""},
		{http.MethodPut, putBody},
		{http.MethodDelete, ""},
	} {
		rec := request(t, handler, tc.method, "/api/v1/workflows/missing-id", tc.body)
		if tc.method == http.MethodDelete {
			if rec.Code != http.StatusNotFound {
				t.Fatalf("%s: %d", tc.method, rec.Code)
			}
			continue
		}
		var got map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || rec.Code != http.StatusNotFound || got["message"] != "Workflow not found." {
			t.Fatalf("%s: %d %s", tc.method, rec.Code, rec.Body.String())
		}
	}
}

func TestAPIPutRejectsEmptyNodesNotFound(t *testing.T) {
	handler, _, _ := newAPI(t)
	rec := request(t, handler, http.MethodPut, "/api/v1/workflows/missing", `{"name":"W","nodes":[]}`)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "Invalid Workflow.") {
		t.Fatalf("put invalid before 404: %d %s", rec.Code, rec.Body.String())
	}
}
