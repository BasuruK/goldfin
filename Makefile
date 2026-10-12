M# Local dev orchestration. Requires: docker, go, pnpm, repo-root `.env` (see .env.example).

.DEFAULT_GOAL := help

ifneq (,$(wildcard .env))
  include .env
  export
endif

GO := go run ./cmd/goldfin
PNPM := pnpm

.PHONY: help check-env db-up db-down db-wait migrate run run-api run-worker run-web

help:
	@echo "Goldfin local dev"
	@echo ""
	@echo "  make db-up       Start Postgres (docker compose)"
	@echo "  make db-down     Stop Postgres"
	@echo "  make migrate     Run goose migrations (needs .env)"
	@echo "  make run         api + worker + vite in one terminal"
	@echo "  make run-api     Go API only"
	@echo "  make run-worker  Go worker only"
	@echo "  make run-web     Vite dev server only"

check-env:
	@test -f .env || (echo "Missing .env — run: cp .env.example .env" && exit 1)
	@test -n "$(APP_KEY)" || (echo "APP_KEY is empty in .env" && exit 1)
	@test -n "$(DATABASE_URL)" || (echo "DATABASE_URL is empty in .env" && exit 1)

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-wait:
	@echo "Waiting for Postgres…"
	@for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do \
		docker compose exec -T postgres pg_isready -U goldfin -d goldfin >/dev/null 2>&1 && exit 0; \
		sleep 1; \
	done; \
	echo "Postgres did not become ready in time."; exit 1

migrate: check-env db-up db-wait
	$(GO) migrate

run-api: check-env
	$(GO) api

run-worker: check-env
	$(GO) worker

run-web:
	$(PNPM) dev

# ponytail: one shell, three processes; trap kills api/worker when vite exits or on Ctrl+C.
run: check-env db-up db-wait
	@trap 'kill 0' INT TERM EXIT; \
	$(GO) api & \
	$(GO) worker & \
	$(PNPM) dev
