package main

import (
	"context"
	"encoding/base64"
	"errors"
	"net/url"

	"github.com/jackc/pgx/v5/pgxpool"
)

// openDatabase transfers the pool to its caller, which closes it after its users stop.
func openDatabase(ctx context.Context) (*pgxpool.Pool, []byte, error) {
	dsn, err := requireEnv("DATABASE_URL")
	if err != nil {
		return nil, nil, err
	}
	endpoint, err := url.Parse(dsn)
	if err != nil || endpoint.Host == "" || (endpoint.Scheme != "postgres" && endpoint.Scheme != "postgresql") {
		return nil, nil, errors.New("DATABASE_URL must be a full postgres URL")
	}
	encodedKey, err := requireEnv("APP_KEY")
	if err != nil {
		return nil, nil, err
	}
	key, err := base64.StdEncoding.DecodeString(encodedKey)
	if err != nil || len(key) != 32 {
		return nil, nil, errors.New("APP_KEY must encode exactly 32 bytes in base64")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, nil, errors.New("invalid DATABASE_URL")
	}
	startupCtx, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(startupCtx, cfg)
	if err != nil {
		return nil, nil, errors.New("could not open database")
	}
	if err := pool.Ping(startupCtx); err != nil {
		pool.Close()
		if ctx.Err() != nil {
			return nil, nil, ctx.Err()
		}
		return nil, nil, errors.New("could not connect to database")
	}
	return pool, key, nil
}
