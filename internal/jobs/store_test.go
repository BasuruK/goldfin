package jobs

import (
	"context"
	"encoding/json"
	"os"
	"testing"

	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCatalogJobRoundTrip(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	store := NewStore(pool, key)
	id, err := store.CreateCatalog(ctx, CreateCatalogInput{
		ProviderType: "openai",
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	job, cipher, err := store.ClaimNext(ctx)
	if err != nil || job.ID != id {
		t.Fatalf("claim: job=%+v err=%v", job, err)
	}
	plain, err := store.DecryptCredential(cipher)
	if err != nil || plain != "sk-test" {
		t.Fatalf("decrypt: %q err=%v", plain, err)
	}
	result := json.RawMessage(`{"state":"ready","ids":["gpt-4"]}`)
	if err := store.Finish(ctx, id, result, "ok"); err != nil {
		t.Fatal(err)
	}
	finished, err := store.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if finished.Status != StatusFinished {
		t.Fatalf("status %s", finished.Status)
	}
}

func TestKeyFromEnv(t *testing.T) {
	t.Setenv("APP_KEY", "")
	if _, err := secretbox.KeyFromEnv(); err == nil {
		t.Fatal("expected error")
	}
}
