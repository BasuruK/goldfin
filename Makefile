# Local dev. Requires: docker, go, pnpm, and a repo-root `.env` (cp .env.example .env).
# Checks also require govulncheck, zizmor and gitleaks (CI installs pinned versions).

.DEFAULT_GOAL := help

GOLANGCI_LINT := go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.14.0

.PHONY: help check up run watch down migrate logs

help:
	@echo "Goldfin local dev"
	@echo ""
	@echo "  make check    vet, lint, vulnerabilities, workflows, Go/unit tests, svelte-check, knip"
	@echo "  make up       Start postgres, migrate, api; wait until healthy"
	@echo "  make run      up, then Vite on the host"
	@echo "  make watch    Rebuild api on Go changes"
	@echo "  make down     Stop all services"
	@echo "  make migrate  Apply migrations"
	@echo "  make logs     Follow api logs"

check:
	go build ./...
	go vet ./...
	$(GOLANGCI_LINT) run
	govulncheck ./...
	zizmor .github/workflows
	gitleaks detect --no-banner --redact
	go test ./...
	pnpm test:unit
	pnpm check
	pnpm knip

up:
	docker compose up -d --build --wait api

run: up
	pnpm dev

watch:
	docker compose watch

down:
	docker compose down

migrate:
	docker compose run --rm migrate

logs:
	docker compose logs -f api
