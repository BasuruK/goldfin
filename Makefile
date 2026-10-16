# Local dev. Requires: docker, go, pnpm, and a repo-root `.env` (cp .env.example .env).
# Checks also require golangci-lint, govulncheck, zizmor and gitleaks (CI installs pinned versions).
# Storage tests require TEST_DATABASE_URL pointing to a disposable *_test or *_tests database.

SQLC = go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1

.DEFAULT_GOAL := help

.PHONY: help check generate up run watch down migrate logs

help:
	@echo "Goldfin local dev"
	@echo ""
	@echo "  make check    vet, lint, vulnerabilities, workflows, Go/unit tests, svelte-check, knip"
	@echo "  make generate Regenerate Go storage queries from SQL"
	@echo "  make up       Start postgres, migrate, api; wait until healthy"
	@echo "  make run      up, then Vite on the host"
	@echo "  make watch    Rebuild api on Go changes"
	@echo "  make down     Stop all services"
	@echo "  make migrate  Apply migrations"
	@echo "  make logs     Follow api logs"

check:
	$(SQLC) diff
	go build ./...
	go vet ./...
	golangci-lint run
	govulncheck ./...
	zizmor .github/workflows
	gitleaks detect --no-banner --redact
	go test ./...
	pnpm test:unit
	pnpm check
	pnpm knip

generate:
	$(SQLC) generate

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
