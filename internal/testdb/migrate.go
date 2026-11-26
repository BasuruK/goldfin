package testdb

import (
	"context"
	"database/sql"
	"sync"
	"testing"

	"github.com/BasuruK/goldfin/db/migrations"
)

var migrateMu sync.Mutex

// MigrateUp runs Goose migrations against one test schema. migrateMu serializes Up calls within one test binary so parallel packages in go test ./... do not fight the Postgres session lock.
func MigrateUp(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	migrateMu.Lock()
	defer migrateMu.Unlock()
	migrator, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := migrator.Up(ctx); err != nil {
		t.Fatal(err)
	}
}
