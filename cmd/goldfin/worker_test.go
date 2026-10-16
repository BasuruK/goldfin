package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
	"time"
)

func TestWorkerRejectsInvalidStartupConfiguration(t *testing.T) {
	validKey := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 32))
	for _, tt := range []struct {
		name, dsn, key, want string
	}{
		{name: "missing_database", key: validKey, want: "DATABASE_URL"},
		{name: "keyword_dsn", dsn: "host=localhost dbname=fixture", key: validKey, want: "DATABASE_URL"},
		{name: "wrong_scheme", dsn: "https://localhost/fixture", key: validKey, want: "DATABASE_URL"},
		{name: "missing_key", dsn: "postgres://localhost/fixture", want: "APP_KEY"},
		{name: "malformed_key", dsn: "postgres://localhost/fixture", key: "invalid-base64", want: "APP_KEY"},
		{name: "short_key", dsn: "postgres://localhost/fixture", key: base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 31)), want: "APP_KEY"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", tt.dsn)
			t.Setenv("APP_KEY", tt.key)
			err := runWorker(t.Context())
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("configuration did not fail explicitly: %v", err)
			}
			if (tt.dsn != "" && strings.Contains(err.Error(), tt.dsn)) || (tt.key != "" && strings.Contains(err.Error(), tt.key)) {
				t.Fatal("startup exposed a configuration value")
			}
		})
	}
}

func TestWorkerDatabaseStartupFailureDoesNotExposeCredentials(t *testing.T) {
	password := rand.Text()
	t.Setenv("DATABASE_URL", "postgres://fixture:"+password+"@127.0.0.1:1/fixture?sslmode=disable")
	t.Setenv("APP_KEY", base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 32)))
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	err := runWorker(ctx)
	if err == nil || strings.Contains(err.Error(), password) || strings.Contains(err.Error(), "127.0.0.1") {
		t.Fatalf("unsafe or missing database startup error: %v", err)
	}
}
