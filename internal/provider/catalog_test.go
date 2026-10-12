package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDiscoverCatalogPaginatesOpenAIModels(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
		}
		after := r.URL.Query().Get("after")
		if after == "" {
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"data":     []map[string]string{{"id": "model-a"}, {"id": "model-b"}},
				"has_more": true,
				"after":    "cursor-1",
			})
			return
		}
		if after != "cursor-1" {
			t.Errorf("unexpected after=%q", after)
			http.Error(w, "bad cursor", http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"data":     []map[string]string{{"id": "model-c"}},
			"has_more": false,
		})
	}))
	defer srv.Close()

	result, err := DiscoverCatalog(context.Background(), srv.Client(), "openai", srv.URL+"/v1", "sk-test")
	if err != nil {
		t.Fatal(err)
	}
	if result.State != "ready" || len(result.IDs) != 3 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if calls != 2 {
		t.Fatalf("expected 2 pages, got %d calls", calls)
	}
}

func TestDiscoverCatalogUnsupportedProviders(t *testing.T) {
	for _, providerType := range []string{"azure", "web_request"} {
		result, err := DiscoverCatalog(context.Background(), http.DefaultClient, providerType, "https://example.com", "")
		if err != nil {
			t.Fatal(err)
		}
		if result.State != "unsupported" {
			t.Fatalf("%s: %+v", providerType, result)
		}
	}
}
