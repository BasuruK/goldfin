package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/testdb"
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

	_, err = subcommand([]string{"goldfin", "migrate", "--dry-run"})
	if err == nil {
		t.Fatal("expected error for trailing arguments")
	}

	_, err = subcommand([]string{"goldfin", "worker"})
	if err == nil {
		t.Fatal("expected the removed worker subcommand to be unknown")
	}

	_, err = subcommand([]string{"goldfin", "nope"})
	if err == nil {
		t.Fatal("expected unknown subcommand error")
	}
}

func TestHealthz(t *testing.T) {
	mux := http.NewServeMux()
	registerAPIRoutes(mux)
	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, healthPath, nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status: got %d", rec.Code)
	}
	if rec.Body.String() != "ok" {
		t.Fatalf("body: got %q", rec.Body.String())
	}
}

func TestHealthcheck(t *testing.T) {
	mux := http.NewServeMux()
	registerAPIRoutes(mux)
	ok := httptest.NewServer(mux)
	defer ok.Close()
	if err := healthcheck(t.Context(), ok.Listener.Addr().String()); err != nil {
		t.Fatalf("healthy api: %v", err)
	}

	bad := httptest.NewServer(http.NotFoundHandler())
	defer bad.Close()
	if err := healthcheck(t.Context(), bad.Listener.Addr().String()); err == nil {
		t.Fatal("expected error for non-200 status")
	}

	down := httptest.NewServer(mux)
	addr := down.Listener.Addr().String()
	down.Close()
	if err := healthcheck(t.Context(), addr); err == nil {
		t.Fatal("expected error when nothing is listening")
	}
}

func TestRunAPIReturnsNilAfterCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if err := runAPI(ctx, "127.0.0.1:0"); err != nil {
		t.Fatalf("runAPI after cancel: %v", err)
	}
}

func TestRunAPIDoesNotLogListeningWhenBindFails(t *testing.T) {
	pool, _ := testdb.New(t)
	t.Setenv("DATABASE_URL", pool.Config().ConnConfig.ConnString())
	t.Setenv("APP_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 32)))
	var logs bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })

	busy, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = busy.Close() }()

	var bindError *net.OpError
	if err := runAPI(t.Context(), busy.Addr().String()); !errors.As(err, &bindError) || bindError.Op != "listen" {
		t.Fatalf("expected a bind error, got %v", err)
	}
	if bytes.Contains(logs.Bytes(), []byte("api listening")) {
		t.Fatalf("logged listening although the bind failed: %s", logs.String())
	}
}

func TestPingHonoursExpiredContext(t *testing.T) {
	db, err := sql.Open("pgx", "postgres://u:p@127.0.0.1:1/db?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if err := ping(ctx, db); !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

func TestProductionAPIServerExposesOCRProbeAndConnectors(t *testing.T) {
	pool, db := testdb.New(t)
	migrator, err := migrations.NewProvider(db)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := migrator.Up(t.Context()); err != nil {
		t.Fatal(err)
	}
	box, err := secretbox.New(bytes.Repeat([]byte{1}, 32))
	if err != nil {
		t.Fatal(err)
	}
	srv := configureAPIServer(t.Context(), buildAPIMux(pool, box))
	ln, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = srv.Close()
		_ = ln.Close()
	})
	go func() { _ = srv.Serve(ln) }()

	base := "http://" + ln.Addr().String()
	listReq, err := http.NewRequestWithContext(t.Context(), http.MethodGet, base+"/api/v1/connectors", nil)
	if err != nil {
		t.Fatal(err)
	}
	list, err := http.DefaultClient.Do(listReq)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = list.Body.Close() }()
	if list.StatusCode != http.StatusOK {
		t.Fatalf("connectors list: %d", list.StatusCode)
	}

	ocrReq, err := http.NewRequestWithContext(t.Context(), http.MethodPost, base+"/api/v1/probes/ocr", strings.NewReader("not multipart"))
	if err != nil {
		t.Fatal(err)
	}
	ocrReq.Header.Set("Content-Type", "text/plain")
	ocr, err := http.DefaultClient.Do(ocrReq)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ocr.Body.Close() }()
	if ocr.StatusCode != http.StatusBadRequest {
		t.Fatalf("OCR probe must be mounted, not 404: %d", ocr.StatusCode)
	}
	body, err := io.ReadAll(ocr.Body)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), "Invalid OCR request") {
		t.Fatalf("unexpected OCR error body: %s", body)
	}
}

func TestAPIServerTimeoutsKeepDefaultRoutesShort(t *testing.T) {
	const short = 30 * time.Second
	if readTimeout != short || writeTimeout != short {
		t.Fatalf("health and Connector routes should use short server timeouts: read=%s write=%s", readTimeout, writeTimeout)
	}
	if readTimeout != writeTimeout {
		t.Fatalf("read and write timeouts should match: %s vs %s", readTimeout, writeTimeout)
	}
}

func TestRequireEnv(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	if _, err := requireEnv("DATABASE_URL"); err == nil {
		t.Fatal("expected error for unset DATABASE_URL")
	}

	t.Setenv("DATABASE_URL", "postgres://127.0.0.1:5432/goldfin")
	got, err := requireEnv("DATABASE_URL")
	if err != nil || got != "postgres://127.0.0.1:5432/goldfin" {
		t.Fatalf("got %q, %v", got, err)
	}
}
