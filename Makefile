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

SQLC = go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1

.DEFAULT_GOAL := help

.PHONY: help check lint generate up run watch down migrate logs

help:
	@echo "Goldfin local dev"
	@echo ""
	@echo "  make check    vet, lint, vulnerabilities, workflows, Go/unit tests, svelte-check, knip"
	@echo "  make lint     build, vet, golangci-lint, svelte-check, knip"
	@echo "  make generate Regenerate Go storage queries from SQL"
	@echo "  make up       Start postgres, migrate, api, worker; wait until running/healthy"
	@echo "  make run      up, then Vite on the host"
	@echo "  make watch    Rebuild api and worker on Go changes"
	@echo "  make down     Stop all services"
	@echo "  make migrate  Apply migrations"
	@echo "  make logs     Follow api and worker logs"

lint:
	go build ./...
	go vet ./...
	golangci-lint run
	pnpm check
	pnpm knip

check: lint
	$(SQLC) diff
	govulncheck ./...
	zizmor .github/workflows
	gitleaks detect --no-banner --redact
	go test ./...
	pnpm test:unit

generate:
	$(SQLC) generate

up:
	docker compose up -d --build --wait api worker

run: up
	pnpm dev

watch:
	docker compose watch

down:
	docker compose down

migrate:
	docker compose run --rm migrate

logs:
	docker compose logs -f api worker
