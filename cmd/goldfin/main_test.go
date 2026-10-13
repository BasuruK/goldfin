package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSubcommand(t *testing.T) {
	sub, err := subcommand([]string{"goldfin", "api"})
	if err != nil || sub != "api" {
		t.Fatalf("api: got %q, %v", sub, err)
	}

	_, err = subcommand([]string{"goldfin"})
	if err == nil {
		t.Fatal("expected usage error")
	}

	_, err = subcommand([]string{"goldfin", "nope"})
	if err == nil {
		t.Fatal("expected unknown subcommand error")
	}
}

func TestHealthz(t *testing.T) {
	mux := http.NewServeMux()
	registerAPIRoutes(mux)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: got %d", rec.Code)
	}
	if rec.Body.String() != "ok" {
		t.Fatalf("body: got %q", rec.Body.String())
	}
}
