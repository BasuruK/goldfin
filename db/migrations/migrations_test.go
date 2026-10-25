package migrations_test

import (
	"database/sql"
	"testing"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	"github.com/BasuruK/goldfin/internal/testdb"
)

const plainConnectorsVersion = 20261022000000

func migrateTo(t *testing.T, db *sql.DB, version int64) {
	t.Helper()
	migrator, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := migrator.UpTo(t.Context(), version); err != nil {
		t.Fatal(err)
	}
}

func seedWebRequestConnector(t *testing.T, db *sql.DB) (id string, ciphertext []byte, label string, setAt time.Time) {
	t.Helper()
	label = "Prod key"
	setAt = time.Date(2026, 10, 20, 12, 0, 0, 0, time.UTC)
	ciphertext = []byte{0x01, 0x02, 0x03}
	err := db.QueryRowContext(t.Context(), `
		INSERT INTO connectors (name, provider_type, base_url, credential_label, credential_ciphertext, credential_set_at)
		VALUES ('Fixture', 'web_request', 'https://example.com', $1, $2, $3)
		RETURNING id`, label, ciphertext, setAt).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id, ciphertext, label, setAt
}

func TestAzureDocumentIntelligenceConnectorSchemaRoundTripAndRollback(t *testing.T) {
	_, db := testdb.New(t)
	ctx := t.Context()

	migrateTo(t, db, plainConnectorsVersion)
	webID, webCipher, webLabel, webSetAt := seedWebRequestConnector(t, db)

	migrator, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := migrator.Up(ctx); err != nil {
		t.Fatal(err)
	}

	var ocrID string
	const apiVersion = "2024-11-30"
	ocrCipher := []byte{0xaa, 0xbb}
	ocrSetAt := time.Date(2026, 10, 24, 9, 0, 0, 0, time.UTC)
	err = db.QueryRowContext(ctx, `
		INSERT INTO connectors (name, provider_type, base_url, api_version, credential_label, credential_ciphertext, credential_set_at)
		VALUES ('Azure OCR', 'azure_document_intelligence', 'https://ocr.example.cognitiveservices.azure.com', $1, 'Azure key', $2, $3)
		RETURNING id`, apiVersion, ocrCipher, ocrSetAt).Scan(&ocrID)
	if err != nil {
		t.Fatal(err)
	}

	var gotVersion string
	if err := db.QueryRowContext(ctx, `SELECT api_version FROM connectors WHERE id = $1`, ocrID).Scan(&gotVersion); err != nil {
		t.Fatal(err)
	}
	if gotVersion != apiVersion {
		t.Fatalf("api_version: got %q want %q", gotVersion, apiVersion)
	}

	var webAPIVersion sql.NullString
	if err := db.QueryRowContext(ctx, `
		SELECT api_version FROM connectors WHERE id = $1`, webID).Scan(&webAPIVersion); err != nil {
		t.Fatal(err)
	}
	if webAPIVersion.Valid {
		t.Fatalf("web_request connector must not have api_version, got %q", webAPIVersion.String)
	}

	_, err = db.ExecContext(ctx, `
		INSERT INTO connectors (name, provider_type, base_url, api_version)
		VALUES ('Mismatch', 'web_request', 'https://example.com', '2024-11-30')`)
	if err == nil {
		t.Fatal("expected web_request with api_version to be rejected")
	}
	_, err = db.ExecContext(ctx, `
		INSERT INTO connectors (name, provider_type, base_url)
		VALUES ('Missing version', 'azure_document_intelligence', 'https://ocr.example.cognitiveservices.azure.com')`)
	if err == nil {
		t.Fatal("expected azure_document_intelligence without api_version to be rejected")
	}

	if _, err := migrator.Down(ctx); err != nil {
		t.Fatal(err)
	}

	var afterName, afterProvider string
	var afterCipher []byte
	var afterLabel sql.NullString
	var afterSetAt sql.NullTime
	var afterAPI sql.NullString
	err = db.QueryRowContext(ctx, `
		SELECT name, provider_type, credential_ciphertext, credential_label, credential_set_at, api_version
		FROM connectors WHERE id = $1`, webID).Scan(&afterName, &afterProvider, &afterCipher, &afterLabel, &afterSetAt, &afterAPI)
	if err != nil {
		t.Fatal(err)
	}
	if afterName != "Fixture" || afterProvider != "web_request" || string(afterCipher) != string(webCipher) ||
		!afterLabel.Valid || afterLabel.String != webLabel || !afterSetAt.Valid || !afterSetAt.Time.Equal(webSetAt) ||
		afterAPI.Valid {
		t.Fatalf("web_request row changed after rollback: %+v", afterName)
	}

	err = db.QueryRowContext(ctx, `
		SELECT name, provider_type, credential_ciphertext, api_version
		FROM connectors WHERE id = $1`, ocrID).Scan(&afterName, &afterProvider, &afterCipher, &afterAPI)
	if err != nil {
		t.Fatal(err)
	}
	if afterProvider != "azure_document_intelligence" || !afterAPI.Valid || afterAPI.String != apiVersion ||
		string(afterCipher) != string(ocrCipher) {
		t.Fatalf("OCR configuration was lost on rollback: provider=%s api=%v cipher=%x", afterProvider, afterAPI, afterCipher)
	}

	var rejectedID string
	err = db.QueryRowContext(ctx, `
		INSERT INTO connectors (name, provider_type, base_url, api_version)
		VALUES ('Bad OCR', 'azure_document_intelligence', 'https://ocr.example.cognitiveservices.azure.com', '2024-11-30')
		RETURNING id`).Scan(&rejectedID)
	if err == nil {
		t.Fatal("expected OCR insert to fail after rollback until migration is reapplied")
	}
}
