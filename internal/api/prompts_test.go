package api_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

type promptVersion struct {
	ID        string `json:"id"`
	Version   int    `json:"version"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

type prompt struct {
	ID            string         `json:"id"`
	Name          string         `json:"name"`
	CreatedAt     string         `json:"createdAt"`
	LatestVersion *promptVersion `json:"latestVersion"`
}

func TestAPICreatesPromptWithVersionOne(t *testing.T) {
	handler, _, _ := newAPI(t)
	body := `{"name":" Invoices ","content":"Extract totals.\n"}`
	created := request(t, handler, http.MethodPost, "/api/v1/prompts", body)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", created.Code, created.Body.String())
	}
	var got prompt
	if err := json.Unmarshal(created.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ID == "" || got.Name != "Invoices" || got.LatestVersion == nil ||
		got.LatestVersion.Version != 1 || got.LatestVersion.Content != "Extract totals.\n" ||
		got.LatestVersion.ID == "" {
		t.Fatalf("created Prompt: %+v", got)
	}
}

func TestAPIAppendsPromptVersionWithoutRewritingPrior(t *testing.T) {
	handler, pool, _ := newAPI(t)
	created := request(t, handler, http.MethodPost, "/api/v1/prompts", `{"name":"Invoices","content":"v1 text"}`)
	var first prompt
	if err := json.Unmarshal(created.Body.Bytes(), &first); err != nil {
		t.Fatal(err)
	}
	second := request(t, handler, http.MethodPost, "/api/v1/prompts/"+first.ID+"/versions", `{"content":"v2 text"}`)
	if second.Code != http.StatusCreated {
		t.Fatalf("append: %d %s", second.Code, second.Body.String())
	}
	var updated prompt
	if err := json.Unmarshal(second.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.LatestVersion.Version != 2 || updated.LatestVersion.Content != "v2 text" {
		t.Fatalf("latest: %+v", updated.LatestVersion)
	}
	var priorContent string
	if err := pool.QueryRow(t.Context(), `
		SELECT content FROM prompt_versions WHERE prompt_id = $1 AND version = 1`, first.ID,
	).Scan(&priorContent); err != nil || priorContent != "v1 text" {
		t.Fatalf("version 1 content: %q err=%v", priorContent, err)
	}
}

func TestAPIListsPromptsWithLatestVersion(t *testing.T) {
	handler, _, _ := newAPI(t)
	request(t, handler, http.MethodPost, "/api/v1/prompts", `{"name":"A","content":"one"}`)
	request(t, handler, http.MethodPost, "/api/v1/prompts", `{"name":"B","content":"two"}`)
	listed := request(t, handler, http.MethodGet, "/api/v1/prompts", "")
	var list struct {
		Prompts []prompt `json:"prompts"`
	}
	if err := json.Unmarshal(listed.Body.Bytes(), &list); err != nil || listed.Code != http.StatusOK {
		t.Fatalf("list: %d %s", listed.Code, listed.Body.String())
	}
	if len(list.Prompts) != 2 || list.Prompts[0].LatestVersion == nil || list.Prompts[1].LatestVersion == nil {
		t.Fatalf("list: %+v", list.Prompts)
	}
}

func TestAPIRenamesPrompt(t *testing.T) {
	handler, _, _ := newAPI(t)
	created := request(t, handler, http.MethodPost, "/api/v1/prompts", `{"name":"Old","content":"body"}`)
	var first prompt
	if err := json.Unmarshal(created.Body.Bytes(), &first); err != nil {
		t.Fatal(err)
	}
	renamed := request(t, handler, http.MethodPatch, "/api/v1/prompts/"+first.ID, `{"name":" New name "}`)
	if renamed.Code != http.StatusOK {
		t.Fatalf("rename: %d %s", renamed.Code, renamed.Body.String())
	}
	var got prompt
	if err := json.Unmarshal(renamed.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Name != "New name" || got.LatestVersion.Content != "body" || got.LatestVersion.Version != 1 {
		t.Fatalf("renamed: %+v", got)
	}
}

func TestAPIRejectsInvalidPrompt(t *testing.T) {
	handler, pool, _ := newAPI(t)
	cases := []struct {
		name string
		method, path, body string
	}{
		{"empty_name", http.MethodPost, "/api/v1/prompts", `{"name":"  ","content":"x"}`},
		{"missing_content", http.MethodPost, "/api/v1/prompts", `{"name":"A"}`},
		{"unknown_prompt", http.MethodPost, "/api/v1/prompts/missing/versions", `{"content":"x"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := request(t, handler, tc.method, tc.path, tc.body)
			if rec.Code != http.StatusBadRequest && rec.Code != http.StatusNotFound {
				t.Fatalf("status: %d %s", rec.Code, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "v1 text") {
				t.Fatal("leaked content in error")
			}
		})
	}
	var n int
	if err := pool.QueryRow(t.Context(), "SELECT count(*) FROM prompts").Scan(&n); err != nil || n != 0 {
		t.Fatalf("invalid inserts: %d err=%v", n, err)
	}
}
