# Goldfin

Single-tenant evaluator running an OCR-then-LLM Pipeline over customer Datasets to attribute which Stage lost a Field value.

## Context pointers & invariants

Read the matching target on turn 1 before exploring or editing that branch:

- **Domain & vocabulary** (`GLOSSARY.md`, `docs/agents/domain.md`): Domain terms, schemas, or Pipeline, Stage, State, Extraction, Match, Verdict, Validity, Coverage, Judge, Dataset, Prompt, Run, Comparison, Probe, Connector, or Credential logic. Use `GLOSSARY.md` terms verbatim.
- **Prompts, formats, & scoring** (`docs/adr/0002-declare-formats-never-infer.md`, `docs/adr/0003-goldfin-does-not-rescue-the-model.md`, `docs/adr/0004-a-blank-cell-is-an-assertion.md`, `docs/adr/0006-judge-contract.md`, `docs/adr/0007-validity-is-structural-and-advisory.md`): LLM calls, Manifest ingest, Normalization, blank cells, Judge, or Validity. **Invariant**: score the prompt as deployed—zero output schemas, format reminders, malformed-output retries, or Judge rescue.
- **Runs, retries, & gateways** (`docs/adr/0008-a-re-attempt-is-a-new-run.md`, `docs/adr/0009-a-fused-gateway-is-supported.md`): Run execution, re-attempts (always new Runs with snapshotted Connector definitions), or fused OCR+LLM gateways (first-class; zero Connector splittability requirement).
- **Topology, Credentials, & worker checks** (`docs/adr/0005-credential-handling.md`, `docs/adr/0010-go-api-postgres-three-containers.md`, `docs/adr/0011-model-selection-belongs-to-the-connector.md`, `docs/adr/0012-worker-checks-gate-connector-saves.md`): Containers (`web` nginx + static SvelteKit, `api` Go HTTP, `worker` Go subcommand over Postgres + `goose`; changes require an ADR), Credentials (read 0005's v1 banner), model catalogs, or Connector saves. **Invariant**: only `worker` makes outbound calls or decrypts a Credential.
- **Worker HTTP, job claims, migrations, & code standards** (`CODING_STANDARDS.md`): Outbound HTTP/provider clients, job claim stores, shutdown, migrations (`db/`), Go API/worker (`cmd/`), frontend async/stores (`src/lib/`), or `Makefile`.
- **UI & design system** (`DESIGN.md`, `PRODUCT.md`): Svelte components, CSS, `Goldfin_Components/`, or `src/routes/`. For live layout iteration, run `pnpm dev` and `/impeccable live` (remove `src/routes/+layout.svelte` markers via `impeccable live-inject --remove`).
- **Issues & triage** (`docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`): GitHub issues or PRs via `gh`.

## Execution sequence

### 1. Scope (`seam`)

1. Deliver one feature seam and one layer per ticket and PR (`/to-spec` → `/to-tickets` → `/implement`; split multi-layer work via `/split-to-prs`).
2. End `/to-spec` and each ticket with a **Failure table** (two writers, mid-flight crash, mid-flight shutdown, timeout, stale reclaim/result, rollback after data exists) for every outbound call, job claim, migration, and async UI path.
3. Cut `/to-tickets` at a single layer (provider client, job queue/migrations, or frontend store).
4. Implement UI strictly from `DESIGN.md` and OpenDesign handoffs; ask for the design artefact when absent.
- **Criterion**: Single-layer seam, design artefact, and failure table are pinned before coding.

### 2. Build (`red` → green)

1. Drive `/implement` with `/tdd`: write a failing test at the seam and watch it go *red* before writing implementation code. Note any trivial-glue exemption in the PR description.
2. Verify module paths, config keys, and flags in `node_modules`, `go doc`, or Context7. Resolve dependency versions, action SHAs, and image digests via CLI commands.
3. Fix compiler, type, and lint errors at the root declaration or call site while keeping strict type and lint checks intact.
4. Migrate all callers and delete replaced functions in the same diff.
- **Criterion**: Every new behavior has a test that went red then green, and all callers use the new contract.

### 3. Verify & review (`sweep`)

1. **Sweep**: After a bug fix, grep Go and JS sides of the contract, the package, and sibling functions for the same shape and fix every match.
2. **Visual**: Capture Playwright screenshots at `375px` and `1280px` for UI changes and verify spacing against `DESIGN.md` tokens.
3. **Gate**: Run `make check` and resolve every failure until green.
4. **Review**: Self-review against `CODING_STANDARDS.md`, run `/code-review`, then `/open-code-review-delegate`. Verify findings against docs and `make check`, apply valid in-seam fixes in commits touching only flagged lines, and reject invalid ones with a one-line reason. If a finding recurs, stop patching and simplify or ask.
5. **Handoff**: If work *outside* the seam remains, end with one question: `"Fix X too?"`
