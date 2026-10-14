# Local dev orchestration. Requires: docker, go, pnpm, repo-root `.env` (see .env.example).
# `cmd/goldfin` is a thin local stub until the full API/worker stack lands on main.

SHELL := /bin/bash

.DEFAULT_GOAL := help

GOLDFIN := .cache/goldfin
PNPM := pnpm
PG_WAIT_SECONDS ?= 60
GOLANGCI_LINT := go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0

.PHONY: help check check-env build-goldfin $(GOLDFIN) db-up db-down db-wait migrate run run-api run-worker run-web

help:
	@echo "Goldfin local dev"
	@echo ""
	@echo "  make check       vet, lint, Go tests, unit tests, svelte-check, tsc, knip (CI runs this)"
	@echo "  make db-up       Start Postgres (docker compose)"
	@echo "  make db-down     Stop Postgres"
	@echo "  make migrate     Run goose migrations (needs .env with DATABASE_URL)"
	@echo "  make run         migrate + api + worker + vite (Vite proxies /api to API_ORIGIN or API_ADDR)"
	@echo "  make run-api     Go API only"
	@echo "  make run-worker  Go worker only"
	@echo "  make run-web     Vite dev server only"

check:
	go vet ./...
	$(GOLANGCI_LINT) run
	go test ./...
	$(PNPM) test:unit
	$(PNPM) check
	$(PNPM) typecheck
	$(PNPM) knip

check-env:
	@test -f .env || (echo "Missing .env — run: cp .env.example .env" && exit 1)
	@grep -q '^DATABASE_URL=.' .env || (echo "Missing DATABASE_URL in .env — see .env.example" && exit 1)

$(GOLDFIN):
	@mkdir -p .cache
	go build -o $(GOLDFIN) ./cmd/goldfin

build-goldfin: $(GOLDFIN)

db-up:
	docker compose up -d postgres

db-down:
	docker compose stop postgres

# The compose healthcheck decides readiness; --wait fails fast with the container's own status.
db-wait:
	docker compose up -d --wait --wait-timeout $(PG_WAIT_SECONDS) postgres

migrate: check-env db-wait $(GOLDFIN)
	$(GOLDFIN) migrate

run-api: check-env db-wait $(GOLDFIN)
	$(GOLDFIN) api

run-worker: check-env db-wait $(GOLDFIN)
	$(GOLDFIN) worker

run-web:
	$(PNPM) dev

# ponytail: one shell, three processes, each in its own process group (`set -m`) so cleanup also reaches
# the children `pnpm dev` spawns. The trap goes first: any early exit, failed start or Ctrl+C stops them all.
run: migrate
	@set -m; API_PID=; WORKER_PID=; VITE_PID=; \
		cleanup() { for p in $$API_PID $$WORKER_PID $$VITE_PID; do kill -- -$$p 2>/dev/null; done; }; \
		trap cleanup EXIT; \
		trap 'exit 130' INT TERM; \
		$(GOLDFIN) api & API_PID=$$!; \
		$(GOLDFIN) worker & WORKER_PID=$$!; \
		HEALTH_URL="$$(node -e 'import("vite").then(async ({ loadEnv }) => { const { resolveApiProxyTarget } = await import("./api-proxy-target.js"); const e = loadEnv("development", ".", ["API_ADDR", "API_ORIGIN"]); console.log(resolveApiProxyTarget(e.API_ORIGIN, e.API_ADDR)); })')/healthz"; \
		ready=0; \
		for i in $$(seq 1 30); do \
			if ! kill -0 $$API_PID 2>/dev/null || ! kill -0 $$WORKER_PID 2>/dev/null; then \
				echo "api or worker failed to start"; exit 1; \
			fi; \
			if curl -fsS "$$HEALTH_URL" >/dev/null 2>&1; then ready=1; break; fi; \
			sleep 0.5; \
		done; \
		if [ "$$ready" -ne 1 ]; then echo "api did not become ready at $$HEALTH_URL"; exit 1; fi; \
		$(PNPM) dev & VITE_PID=$$!; \
		while kill -0 $$VITE_PID 2>/dev/null; do \
			if ! kill -0 $$API_PID 2>/dev/null || ! kill -0 $$WORKER_PID 2>/dev/null; then \
				echo "api or worker exited unexpectedly"; exit 1; \
			fi; \
			sleep 0.5; \
		done; \
		wait $$VITE_PID
