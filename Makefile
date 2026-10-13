# Local dev orchestration. Requires: docker, go, pnpm, repo-root `.env` (see .env.example).
# `cmd/goldfin` is a thin local stub until the full API/worker stack lands on main.

SHELL := /bin/bash

.DEFAULT_GOAL := help

GOLDFIN := .cache/goldfin
GOLDFIN_SRC := $(shell find cmd db/migrations -name '*.go' 2>/dev/null)
PNPM := pnpm
PG_WAIT_SECONDS ?= 60

.PHONY: help check-env build-goldfin db-up db-down db-wait migrate run run-api run-worker run-web

help:
	@echo "Goldfin local dev"
	@echo ""
	@echo "  make db-up       Start Postgres (docker compose)"
	@echo "  make db-down     Stop Postgres"
	@echo "  make migrate     Run goose migrations (needs .env with DATABASE_URL)"
	@echo "  make run         api + worker + vite (Vite proxies /api to API_ORIGIN or API_ADDR)"
	@echo "  make run-api     Go API only"
	@echo "  make run-worker  Go worker only"
	@echo "  make run-web     Vite dev server only"

check-env:
	@test -f .env || (echo "Missing .env — run: cp .env.example .env" && exit 1)

$(GOLDFIN): $(GOLDFIN_SRC) go.mod go.sum
	@mkdir -p .cache
	go build -o $(GOLDFIN) ./cmd/goldfin

build-goldfin: $(GOLDFIN)

db-up:
	docker compose up -d postgres

db-down:
	docker compose stop postgres

db-wait: db-up
	@echo "Waiting for Postgres…"
	@for i in $$(seq 1 $(PG_WAIT_SECONDS)); do \
		docker compose exec -T postgres sh -c 'pg_isready -h 127.0.0.1 -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' >/dev/null 2>&1 && exit 0; \
		sleep 1; \
	done; \
	echo "Postgres did not become ready in time."; exit 1

migrate: check-env db-wait $(GOLDFIN)
	$(GOLDFIN) migrate

run-api: check-env db-wait $(GOLDFIN)
	$(GOLDFIN) api

run-worker: check-env db-wait $(GOLDFIN)
	$(GOLDFIN) worker

run-web:
	$(PNPM) dev

# ponytail: one shell, three processes; trap kills api/worker when vite exits or on Ctrl+C.
run: check-env db-wait $(GOLDFIN)
	@trap 'kill $$API_PID $$WORKER_PID 2>/dev/null' INT TERM EXIT; \
		$(GOLDFIN) api & API_PID=$$!; \
		$(GOLDFIN) worker & WORKER_PID=$$!; \
		sleep 0.5; \
		if ! kill -0 $$API_PID 2>/dev/null || ! kill -0 $$WORKER_PID 2>/dev/null; then \
			echo "api or worker failed to start"; exit 1; \
		fi; \
		$(PNPM) dev & VITE_PID=$$!; \
		while kill -0 $$VITE_PID 2>/dev/null; do \
			if ! kill -0 $$API_PID 2>/dev/null || ! kill -0 $$WORKER_PID 2>/dev/null; then \
				echo "api or worker exited unexpectedly"; kill $$VITE_PID 2>/dev/null; wait $$VITE_PID 2>/dev/null; exit 1; \
			fi; \
			sleep 0.5; \
		done; \
		wait $$VITE_PID; status=$$?; \
		exit $$status
