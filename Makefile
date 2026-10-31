# Local dev. Requires: docker, go, pnpm, and a repo-root `.env` (cp .env.example .env).
# Checks also require golangci-lint, govulncheck, zizmor and gitleaks (CI installs pinned versions).
# `make check` fails unless TEST_DATABASE_URL points to a disposable *_test or *_tests database.
# Isolated test database (tmpfs, loopback-only, nothing persists; stop it to clean up):
#   docker run --rm -d --name goldfin-tests -p 127.0.0.1::5432 --tmpfs /var/lib/postgresql/data \
#     -e POSTGRES_USER=goldfin_test -e POSTGRES_DB=goldfin_test -e POSTGRES_HOST_AUTH_METHOD=trust \
#     postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea
#   port=$(docker inspect goldfin-tests --format '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}')
#   export TEST_DATABASE_URL="postgres://goldfin_test@127.0.0.1:$port/goldfin_test?sslmode=disable"
#   make check; docker stop goldfin-tests

.DEFAULT_GOAL := help

.PHONY: help check lint up run watch down migrate logs

help:
	@echo "Goldfin local dev"
	@echo ""
	@echo "  make check    vet, lint, vulnerabilities, workflows, Go/unit tests, svelte-check, knip"
	@echo "  make lint     build, vet, golangci-lint, svelte-check, knip"
	@echo "  make up       Start postgres, migrate, api; wait until running/healthy"
	@echo "  make run      up, then Vite on the host"
	@echo "  make watch    Rebuild api on Go changes"
	@echo "  make down     Stop all services"
	@echo "  make migrate  Apply migrations"
	@echo "  make logs     Follow api logs"

lint:
	go build ./...
	go vet ./...
	golangci-lint run
	pnpm check
	pnpm --dir Goldfin_Components check
	pnpm lint:boundaries
	pnpm knip

check: lint
	govulncheck ./...
	zizmor .github/workflows
	gitleaks detect --no-banner --redact
	go test ./...
	pnpm test:unit
	pnpm --dir Goldfin_Components test

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
