# Goldfin

Single-tenant tool for evaluating document-extraction prompts. **v1** (`docs/adr/0014-v1-is-a-workflow-playground-without-scoring.md`) runs one Document through an operator-built Workflow of OCR, LLM and REST Connectors and shows what each node extracted. Nothing about an execution is stored. Datasets arrive in v2, and scoring after that. `prototypes/ocr only workflow/ocr-playground.html` and its tests are the v1 UI and request spec. Use `GLOSSARY.md` terms verbatim.

## Invariants

Every change keeps these two. The ADRs hold the reasons.

- **Prompt as deployed** (ADR 0003, 0009): send the prompt exactly as deployed, with no output schema, format reminder, or retry of a malformed or cut-off answer. Show a cut-off answer as extracted, labelled with how it stopped.
- **Credentials** (ADR 0005, 0013): a Credential is encrypted at rest, sent only over https, kept out of URLs, and never returned, logged, or derived into a response; a Connector save refuses credential-shaped query parameters. Connector saves encrypt on write; only the synchronous probe path (`internal/probe`) decrypts, in-process, until a worker exists.

## Repository layout

Two containers over Postgres (ADR 0010 as amended by 0013; changing them needs an ADR): `web` (nginx + static SvelteKit) and `api` (Go). Migrations are `goose` files in `db/migrations/`, applied by `make migrate`, a one-shot Compose service. Local Compose runs `postgres`, `migrate` and `api`; the UI runs from `pnpm dev`.

- `cmd/goldfin/` is the `api` entry point. `internal/handler` mounts the routes; `internal/api` saves and lists Connectors; `internal/probe` runs synchronous Probes; `internal/azureocr` is the Azure Document Intelligence client; `internal/secretbox` encrypts Credentials; `internal/testdb` gives each DB test a disposable schema.
- `src/lib/<surface>/` holds each surface's API client and store (`connectors`, `ocr`); `src/routes/` holds pages; `Goldfin_Components/` is the design system.

## Commands

- `make run`: Postgres and `api` in Docker on `127.0.0.1:8080`, then `pnpm dev` on `127.0.0.1:5174`. `make logs` tails the `api`; read it when a request fails and the page shows only a mapped message.
- **While iterating**, run only the tests that cover your change: `go test ./internal/probe/...`, `node --test tests/ocr/<file>.test.ts`, `pnpm exec playwright test tests/<file>.spec.ts`. DB-backed Go tests need `TEST_DATABASE_URL` pointing at a disposable database.
- `make check` runs everything CI's `make check` job runs, and is green before you push. CI also runs the Playwright suite.

## Context pointers

Read the matching doc before editing that area:

- **Landing a change** (`docs/agents/landing.md`): before starting a ticket, and again before opening its PR.
- **Code standards** (`CODING_STANDARDS.md`): any code in `cmd/`, `internal/`, `db/`, `src/lib/`, `src/routes/`, or the `Makefile`. Read it while writing, not only at review.
- **Domain** (`GLOSSARY.md`, `docs/agents/domain.md`): naming, adding, or changing a domain concept or schema.
- **Workflow execution** (ADR 0014, 0003, 0009, the prototype above): Workflow graphs, Probes, LLM calls, Prompt versions, fused gateways.
- **Connectors** (ADR 0005 and 0013 banners, ADR 0011): Credentials, Connector saves, model catalogs. ADR 0013 lists each deferred mechanism with the trigger that brings it back.
- **UI** (`DESIGN.md`, `PRODUCT.md`): Svelte components, CSS, `Goldfin_Components/`, `src/routes/`. Build from `DESIGN.md` and the OpenDesign handoff; ask for the design artefact when it is absent. For live layout iteration run `pnpm dev` and `/impeccable live`, then remove the `src/routes/+layout.svelte` markers with `impeccable live-inject --remove`.
- **Issues** (`docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`): GitHub issues and PRs via `gh`.
- **Scoring & Runs** (ADR 0002, 0004, 0006, 0007, 0008): v2 and later. v1 builds none of it.
