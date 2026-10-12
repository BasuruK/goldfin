# Issue #31 — Worker model discovery

## Triage

- **Parent:** [#31](https://github.com/BasuruK/goldfin/issues/31); save-path children (#34–#36) not merged yet.
- **Blocker:** No Go API/worker/Postgres in repo. Live discovery cannot ship without a worker boundary (ADR 0005/0010).
- **Ponytail path:** Discovery jobs only (no Connector save to Postgres). UI still uses localStorage for Connector rows; credentials are sent to the API only inside encrypted job rows and are never returned.

## Plan

| # | Task | Status |
|---|------|--------|
| 1 | Triage + TASKS.md | done |
| 2 | Domain: `finishDiscovery` retains `verified`, API result mapper | done |
| 3 | Go: encrypted job store, OpenAI `/models` pagination, api + worker | done |
| 4 | Go: model verification job (minimal completion) | done |
| 5 | Frontend: discovery client, poll loop, verify on enable | done |
| 6 | UI copy + Playwright/unit tests | done |
| 7 | Ponytail review pass | done |

## Ponytail review (applied / deferred)

- `internal/jobs/store.go:WaitUntilFinished` — **delete candidate** (test-only helper); left for integration tests later.
- `store.svelte.js:previewModelsById` alias — **keep** until all imports gone (one caller max).
- **Deferred:** sqlc (raw pgx + one migration); full Connector persistence (#34); browser `Test` still client-side until save slice.
- **Deferred:** ADR credential URL guard on discovery POST (belongs with #34 API validation).

## Local dev

```sh
docker compose up -d
cp .env.example .env
# set APP_KEY in .env: openssl rand -base64 32
go run ./cmd/goldfin migrate
go run ./cmd/goldfin api &
go run ./cmd/goldfin worker &
pnpm dev
```

Change `API_ADDR` in `.env` if port 8080 is taken; Vite reads the same key for the `/api` proxy.

## Log

- 2026-10-12: Vertical slice — worker catalog + verification, UI discovers via `/api`, simulated preview removed.
