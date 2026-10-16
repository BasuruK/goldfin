package main

import (
	"context"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/url"

	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/provider"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/worker"
	"github.com/jackc/pgx/v5/pgxpool"
)

func runWorker(ctx context.Context) error {
	dsn, err := requireEnv("DATABASE_URL")
	if err != nil {
		return err
	}
	endpoint, err := url.Parse(dsn)
	if err != nil || endpoint.Host == "" || (endpoint.Scheme != "postgres" && endpoint.Scheme != "postgresql") {
		return errors.New("DATABASE_URL must be a full postgres URL")
	}
	encodedKey, err := requireEnv("APP_KEY")
	if err != nil {
		return err
	}
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil || len(key) != 32 {
		return errors.New("APP_KEY must encode exactly 32 bytes in base64")
	}
	box, err := secretbox.New(key)
	if err != nil {
		return err
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return errors.New("invalid DATABASE_URL")
	}
	startupCtx, startupCancel := context.WithTimeout(ctx, pingTimeout)
	pool, err := pgxpool.NewWithConfig(startupCtx, cfg)
	if err != nil {
		startupCancel()
		return errors.New("worker could not open database")
	}
	defer pool.Close()
	err = pool.Ping(startupCtx)
	startupCancel()
	if err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return errors.New("worker could not connect to database")
	}
	store, err := jobs.NewStore(pool, key)
	if err != nil {
		return err
	}
	client := provider.NewClient()
	defer client.CloseIdleConnections()
	slog.Info("worker started")
	return worker.Run(ctx, store, box, client)
}
