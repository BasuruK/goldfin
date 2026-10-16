package jobs_test

import (
	"context"
	"testing"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	"github.com/pressly/goose/v3/lock"
)

func TestMigrationLifecycleWithPopulatedTables(t *testing.T) {
	pool, db := newTestDatabase(t)
	provider, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(t.Context(), `
		INSERT INTO connectors (id, name, base_url) VALUES ('connector', 'Fixture', 'https://example.com');
		INSERT INTO credential_generations (id, connector_id, label, ciphertext)
		VALUES ('generation', 'connector', 'Fixture label', decode(repeat('01', 32), 'hex'));
		UPDATE connectors SET credential_generation_id = 'generation' WHERE id = 'connector';
		INSERT INTO connector_save_attempts (name, base_url, credential_label, candidate_ciphertext, expires_at)
		VALUES ('Pending', 'https://example.com', 'Candidate label', decode(repeat('02', 32), 'hex'), now() + interval '1 hour');
	`)
	if err != nil {
		t.Fatal(err)
	}
	if applied, err := provider.Up(t.Context()); err != nil || len(applied) != 0 {
		t.Fatalf("repeat Up: applied=%d, error=%v", len(applied), err)
	}
	var label string
	if err := pool.QueryRow(t.Context(), `
		UPDATE credential_generations SET state = 'tombstoned', ciphertext = NULL
		WHERE id = 'generation' RETURNING label
	`).Scan(&label); err != nil || label != "Fixture label" {
		t.Fatalf("tombstone must retain identity/label: %q, %v", label, err)
	}
	if _, err := provider.Down(t.Context()); err != nil {
		t.Fatal(err)
	}
	var tables int
	if err := pool.QueryRow(t.Context(), `SELECT count(*) FROM information_schema.tables
		WHERE table_schema = current_schema() AND table_name IN ('connectors', 'credential_generations', 'connector_save_attempts')`).Scan(&tables); err != nil || tables != 0 {
		t.Fatalf("Down left schema objects: count=%d, error=%v", tables, err)
	}
	if _, err := provider.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(t.Context(), "SELECT count(*) FROM connectors").Scan(&tables); err != nil || tables != 0 {
		t.Fatalf("fresh Up: count=%d, error=%v", tables, err)
	}
}

func TestMigrationLockCancellationAndConcurrentStartup(t *testing.T) {
	_, db := newTestDatabase(t)
	provider, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	locker, err := lock.NewPostgresSessionLocker()
	if err != nil {
		t.Fatal(err)
	}
	conn, err := db.Conn(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close() }()
	if err := locker.SessionLock(t.Context(), conn); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Millisecond)
	_, blocked := provider.Up(ctx)
	cancel()
	if err := locker.SessionUnlock(t.Context(), conn); err != nil {
		t.Fatal(err)
	}
	if blocked == nil {
		t.Fatal("migration bypassed the session lock")
	}
	// A restarted migration command creates a fresh provider after cancellation.
	provider, err = migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	other, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	results := make(chan error, 2)
	go func() { _, err := provider.Up(t.Context()); results <- err }()
	go func() { _, err := other.Up(t.Context()); results <- err }()
	for range 2 {
		if err := <-results; err != nil {
			t.Fatalf("migration could not retry/concurrently start: %v", err)
		}
	}
}
