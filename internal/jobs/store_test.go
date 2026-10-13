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
	ctx, pool, store := newTestStore(t)
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
	if err := store.Finish(ctx, id, job.ClaimToken, result, "ok"); err != nil {
		t.Fatal(err)
	}
	var cleared bool
	if err := pool.QueryRow(ctx, `SELECT credential_ciphertext IS NULL FROM discovery_jobs WHERE id = $1`, id).Scan(&cleared); err != nil {
		t.Fatal(err)
	}
	if !cleared {
		t.Fatal("ciphertext still stored")
	}
	finished, err := store.Get(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if finished.Status != StatusFinished {
		t.Fatalf("status %s", finished.Status)
	}
}

func TestClaimNextReclaimsStaleRunningJob(t *testing.T) {
	ctx, pool, store := newTestStore(t)
	id, err := store.CreateCatalog(ctx, CreateCatalogInput{
		ProviderType: "openai",
		BaseURL:      "https://api.openai.com/v1",
		APIKey:       "sk-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE discovery_jobs SET status = 'running', updated_at = now() WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	fresh, _, err := store.ClaimNext(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if fresh.ID != "" {
		t.Fatalf("claimed a fresh running job %s", fresh.ID)
	}
	if _, err := pool.Exec(ctx, `UPDATE discovery_jobs SET updated_at = now() - interval '3 minutes' WHERE id = $1`, id); err != nil {
		t.Fatal(err)
	}
	job, _, err := store.ClaimNext(ctx)
	if err != nil || job.ID != id {
		t.Fatalf("reclaim: job=%+v err=%v", job, err)
	}
	if job.Kind != KindCatalog {
		t.Fatalf("kind %s", job.Kind)
	}
}

func newTestStore(t *testing.T) (context.Context, *pgxpool.Pool, *Store) {
	t.Helper()
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
	for i := range key {
		key[i] = byte(i)
	}
	return ctx, pool, NewStore(pool, key)
}

func TestKeyFromEnv(t *testing.T) {
	t.Setenv("APP_KEY", "")
	if _, err := secretbox.KeyFromEnv(); err == nil {
		t.Fatal("expected error")
	}
}
