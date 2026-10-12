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
		if r.Header.Get("Authorization") != "Bearer sk-test" || r.Header.Get("api-key") != "" {
			t.Errorf("openai auth=%q api-key=%q", r.Header.Get("Authorization"), r.Header.Get("api-key"))
			http.Error(w, "bad auth", http.StatusBadRequest)
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

func TestVerifyModelAzureUsesDeploymentEndpointAndAPIKey(t *testing.T) {
	cases := []struct {
		suffix string
		path   string
	}{
		{suffix: "", path: "/openai/deployments/dep-1/chat/completions"},
		{suffix: "/openai/deployments/my-dep", path: "/openai/deployments/my-dep/chat/completions"},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != tc.path || r.URL.Query().Get("api-version") != azureAPIVersion {
					t.Errorf("url %s", r.URL.String())
					http.NotFound(w, r)
					return
				}
				if r.Header.Get("api-key") != "azure-secret" || r.Header.Get("Authorization") != "" {
					t.Errorf("api-key=%q authorization=%q", r.Header.Get("api-key"), r.Header.Get("Authorization"))
					http.Error(w, "bad auth", http.StatusBadRequest)
					return
				}
				w.WriteHeader(http.StatusOK)
			}))
			defer srv.Close()

			result, err := VerifyModel(context.Background(), srv.Client(), "azure", srv.URL+tc.suffix, "azure-secret", "dep-1")
			if err != nil {
				t.Fatal(err)
			}
			if !result.Verified {
				t.Fatalf("unexpected result: %+v", result)
			}
		})
	}
}
