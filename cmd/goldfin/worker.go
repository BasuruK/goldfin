package main

import (
	"context"
	"log/slog"

	"github.com/BasuruK/goldfin/internal/jobs"
	"github.com/BasuruK/goldfin/internal/provider"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/BasuruK/goldfin/internal/worker"
)

func runWorker(ctx context.Context) error {
	pool, key, err := openDatabase(ctx)
	if err != nil {
		if ctx.Err() != nil {
			return nil
		}
		return err
	}
	defer pool.Close()
	box, err := secretbox.New(key)
	if err != nil {
		return err
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
