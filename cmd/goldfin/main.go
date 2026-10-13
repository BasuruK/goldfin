package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/BasuruK/goldfin/internal/api"
	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/worker"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
)

func main() {
	// ponytail: optional repo-root .env for local api/worker/migrate; production uses real env vars.
	_ = godotenv.Load()

	if len(os.Args) < 2 {
		fatal("usage: goldfin <api|worker|migrate>")
	}
	switch os.Args[1] {
	case "api":
		runAPI()
	case "worker":
		runWorker()
	case "migrate":
		runMigrate()
	default:
		fatal("unknown subcommand: " + os.Args[1])
	}
}

func runMigrate() {
	dsn := mustEnv("DATABASE_URL")
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		fatal(err.Error())
	}
	defer db.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		fatal(err.Error())
	}
	if err := goose.Up(db, "db/migrations"); err != nil {
		fatal(err.Error())
	}
}

func runAPI() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pool := mustPool(ctx)
	key := mustKey()
	store := jobs.NewStore(pool, key)
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	addr := envOr("API_ADDR", "127.0.0.1:8080")
	server := api.NewServer(store, logger)
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
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

func runWorker() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pool := mustPool(ctx)
	key := mustKey()
	store := jobs.NewStore(pool, key)
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	logger.Info("worker started")
	worker.Run(ctx, store, logger)
}

func mustPool(ctx context.Context) *pgxpool.Pool {
	dsn := mustEnv("DATABASE_URL")
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fatal(err.Error())
	}
	return pool
}

func mustKey() []byte {
	key, err := secretbox.KeyFromEnv()
	if err != nil {
		fatal(err.Error())
	}
	return key
}

func mustEnv(name string) string {
	value := os.Getenv(name)
	if value == "" {
		fatal(name + " is not set")
	}
	return value
}

func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func fatal(msg string) {
	slog.Error(msg)
	os.Exit(1)
}
