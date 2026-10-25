// Package handler mounts the Connector API and Probe routes on one HTTP handler.
package handler

import (
	"net/http"

	"github.com/BasuruK/goldfin/internal/api"
	"github.com/BasuruK/goldfin/internal/probe"
	"github.com/BasuruK/goldfin/internal/secretbox"
	"github.com/jackc/pgx/v5/pgxpool"
)

// New wires Connector create/list and the OCR Probe. Probe routes use the executor budget; Connector routes keep the short database guard.
func New(pool *pgxpool.Pool, box *secretbox.Box, transport http.RoundTripper) http.Handler {
	mux := http.NewServeMux()
	mux.Handle(probe.OCRPattern, probe.NewOCRHandler(pool, box, transport))
	mux.Handle("/", api.NewHandler(pool, box))
	return mux
}
