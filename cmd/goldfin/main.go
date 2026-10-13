// Local dev entrypoint (api / worker / migrate). Replace with the full stack when it merges to main.
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/joho/godotenv"
	"github.com/pressly/goose/v3"
)

func main() {
	_ = godotenv.Load()

	sub, err := subcommand(os.Args)
	if err != nil {
		fatal(err.Error())
	}
	switch sub {
	case "api":
		runAPI()
	case "worker":
		runWorker()
	case "migrate":
		runMigrate()
	default:
		fatal("unknown subcommand: " + sub)
	}
}

func subcommand(args []string) (string, error) {
	if len(args) < 2 {
		return "", errors.New("usage: goldfin <api|worker|migrate>")
	}
	switch args[1] {
	case "api", "worker", "migrate":
		return args[1], nil
	default:
		return "", fmt.Errorf("unknown subcommand: %s", args[1])
	}
}

func runMigrate() {
	dsn := mustEnv("DATABASE_URL")
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		fatal(err.Error())
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		fatal(err.Error())
	}
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

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	addr := envOr("API_ADDR", "127.0.0.1:8080")
	mux := http.NewServeMux()
	registerAPIRoutes(mux)
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
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
}

func runWorker() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	logger.Info("worker started (no jobs yet)")
	<-ctx.Done()
	logger.Info("worker stopped")
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
