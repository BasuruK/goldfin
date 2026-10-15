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
	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
)

func main() {
	if err := loadDotenv(); err != nil {
		fatal(err.Error())
	}

	sub, err := subcommand(os.Args)
	if err != nil {
		fatal(err.Error())
	}
	switch sub {
	case "api":
		runAPI()
	case "migrate":
		if err := runMigrate(); err != nil {
			fatal(err.Error())
		}
	case "healthcheck":
		if err := healthcheck(context.Background(), envOr("API_ADDR", "127.0.0.1:8080")); err != nil {
			fatal(err.Error())
		}
	}
}

func loadDotenv() error {
	err := godotenv.Load()
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

func subcommand(args []string) (string, error) {
	if len(args) < 2 {
		return "", errors.New("usage: goldfin <api|migrate|healthcheck>")
	}
	switch args[1] {
	case "api", "migrate", "healthcheck":
		return args[1], nil
	default:
		return "", fmt.Errorf("unknown subcommand: %s", args[1])
	}
}

// migrateTimeout bounds connect, ping and the migrations together, so a stalled database fails the
// command instead of hanging it. Each migration runs in its own transaction, so a cancel rolls back.
const migrateTimeout = 2 * time.Minute

const healthcheckTimeout = 3 * time.Second

func runMigrate() error {
	dsn, err := requireEnv("DATABASE_URL")
	if err != nil {
		return err
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), migrateTimeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		return err
	}
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.UpContext(ctx, db, "."); err != nil {
		return err
	}
	return nil
}

func runAPI() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	addr := envOr("API_ADDR", "127.0.0.1:8080")
	mux := http.NewServeMux()
	registerAPIRoutes(mux)
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			logger.Error("api shutdown", "err", err)
		}
	}()
	logger.Info("api listening", "addr", addr)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fatal(err.Error())
	}
	<-shutdownDone
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

func fatal(msg string) {
	slog.Error("fatal", "error", msg)
	os.Exit(1)
}
