package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVerifyModelAcceptsMinimalCompletion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	result, err := VerifyModel(context.Background(), srv.Client(), "openai", srv.URL+"/v1", "sk-test", "gpt-test")
	if err != nil {
		t.Fatal(err)
	}
	if !result.Verified || result.State != "ready" {
		t.Fatalf("unexpected result: %+v", result)
	}
}
