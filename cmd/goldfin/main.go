// Local dev entrypoint (api / migrate / healthcheck). Replace with the full stack when it merges to main.
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/BasuruK/goldfin/db/migrations"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func main() {
	if err := run(os.Args); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	sub, err := subcommand(args)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	addr := envOr("API_ADDR", "127.0.0.1:8080")
	switch sub {
	case "api":
		return runAPI(ctx, addr)
	case "migrate":
		return runMigrate(ctx)
	case "healthcheck":
		return healthcheck(ctx, addr)
	}
	return nil
}

func subcommand(args []string) (string, error) {
	const usage = "usage: goldfin <api|migrate|healthcheck>"
	if len(args) != 2 {
		return "", errors.New(usage)
	}
	switch args[1] {
	case "api", "migrate", "healthcheck":
		return args[1], nil
	default:
		return "", fmt.Errorf("unknown subcommand: %s", args[1])
	}
}

const (
	pingTimeout = 5 * time.Second
	// migrateTimeout bounds the migrations, so a stalled database fails the command instead of
	// hanging it. Each migration runs in its own transaction, so a cancel rolls back.
	migrateTimeout     = 2 * time.Minute
	healthcheckTimeout = 3 * time.Second

	readHeaderTimeout = 10 * time.Second
	readTimeout       = 30 * time.Second
	writeTimeout      = 30 * time.Second
	idleTimeout       = 2 * time.Minute
	shutdownTimeout   = 10 * time.Second
)

func ping(ctx context.Context, db *sql.DB) error {
	ctx, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()
	return db.PingContext(ctx)
}

func runMigrate(ctx context.Context) error {
	dsn, err := requireEnv("DATABASE_URL")
	if err != nil {
		return err
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	if err := ping(ctx, db); err != nil {
		return err
	}
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	goose.SetBaseFS(migrations.FS)
	ctx, cancel := context.WithTimeout(ctx, migrateTimeout)
	defer cancel()
	return goose.UpContext(ctx, db, ".")
}

// runAPI serves until ctx is cancelled. The listener exists before Serve starts, so a cancel that
// lands early is harmless: Shutdown makes Serve close it and return ErrServerClosed.
func runAPI(ctx context.Context, addr string) error {
	mux := http.NewServeMux()
	registerAPIRoutes(mux)
	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}
	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", addr)
	if err != nil {
		return err
	}
	slog.Info("api listening", "addr", ln.Addr().String())
	errCh := make(chan error, 1)
	go func() { errCh <- srv.Serve(ln) }()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-errCh; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// healthcheck probes the local API. addr is the bind address, so only its port is used: a wildcard
// host (0.0.0.0) is not dialable.
func healthcheck(ctx context.Context, addr string) error {
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, healthcheckTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+net.JoinHostPort("127.0.0.1", port)+healthPath, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthcheck: status %d", resp.StatusCode)
	}
	return nil
}

func requireEnv(name string) (string, error) {
	value := os.Getenv(name)
	if value == "" {
		return "", fmt.Errorf("%s is not set", name)
	}
	return value, nil
}

func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
