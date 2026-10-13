package api

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestDiscoveryRejectsNonHTTPS(t *testing.T) {
	server := NewServer(nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	body := `{"providerType":"openai","baseUrl":"http://127.0.0.1/v1","apiKey":"sk","modelId":"gpt"}`
	for _, path := range []string{"/api/v1/model-discovery/attempts", "/api/v1/model-verification/attempts"} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		rec := httptest.NewRecorder()
		server.Handler().ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("%s: status %d body %s", path, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "https") {
			t.Fatalf("%s: %s", path, rec.Body.String())
		}
	}
}

func TestGetAttemptRejectsOtherKind(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, `DELETE FROM discovery_jobs`); err != nil {
		t.Fatal(err)
	}
	key := make([]byte, 32)
	store := jobs.NewStore(pool, key)
	id, err := store.CreateCatalog(ctx, jobs.CreateCatalogInput{
		ProviderType: "openai",
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(store, slog.New(slog.NewTextHandler(io.Discard, nil)))
	verifyReq := httptest.NewRequest(http.MethodGet, "/api/v1/model-verification/attempts/"+id, nil)
	verifyRec := httptest.NewRecorder()
	server.Handler().ServeHTTP(verifyRec, verifyReq)
	if verifyRec.Code != http.StatusNotFound {
		t.Fatalf("verify status %d", verifyRec.Code)
	}
	catalogReq := httptest.NewRequest(http.MethodGet, "/api/v1/model-discovery/attempts/"+id, nil)
	catalogRec := httptest.NewRecorder()
	server.Handler().ServeHTTP(catalogRec, catalogReq)
	if catalogRec.Code != http.StatusOK {
		t.Fatalf("catalog status %d body %s", catalogRec.Code, catalogRec.Body.String())
	}
}
