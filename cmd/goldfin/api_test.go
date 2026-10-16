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

func TestAPIRejectsInvalidStartupConfiguration(t *testing.T) {
	password := rand.Text()
	for _, tc := range []struct{ name, dsn, key, want string }{
		{name: "missing_database", want: "DATABASE_URL"},
		{name: "keyword_dsn", dsn: "host=localhost dbname=fixture", want: "DATABASE_URL"},
		{name: "missing_key", dsn: "postgres://localhost/fixture", want: "APP_KEY"},
		{name: "invalid_key", dsn: "postgres://localhost/fixture", key: "credential-canary", want: "APP_KEY"},
		{name: "unavailable_database", dsn: "postgres://fixture:" + password + "@127.0.0.1:1/fixture?sslmode=disable", key: base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 32)), want: "database"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", tc.dsn)
			t.Setenv("APP_KEY", tc.key)
			ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
			defer cancel()
			err := runAPI(ctx, "127.0.0.1:0")
			if err == nil || !strings.Contains(err.Error(), tc.want) || strings.Contains(err.Error(), "credential-canary") || strings.Contains(err.Error(), password) {
				t.Fatalf("unsafe or missing startup validation: %v", err)
			}
		})
	}
}
