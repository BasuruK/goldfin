# Goldfin

Single-tenant tool for evaluating document-extraction prompts. **v1** (`docs/adr/0014-v1-is-a-workflow-playground-without-scoring.md`) runs one Document through an operator-built Workflow of OCR, LLM and REST Connectors and shows what each node extracted. Nothing about an execution is stored. Datasets arrive in v2, and scoring after that. `prototypes/ocr only workflow/ocr-playground.html` and its tests are the v1 UI and request spec.

## Context pointers & invariants

Read the matching target on turn 1 before exploring or editing that branch:

- **Domain & vocabulary** (`GLOSSARY.md`, `docs/agents/domain.md`): Domain terms, schemas, or Workflow, Probe, Pipeline, Stage, State, Extraction, Match, Verdict, Validity, Coverage, Judge, Dataset, Prompt, Run, Comparison, Probe, Connector, or Credential logic. Use `GLOSSARY.md` terms verbatim.
- **Workflows, Probes, & Prompts** (`docs/adr/0014-v1-is-a-workflow-playground-without-scoring.md`, `docs/adr/0003-goldfin-does-not-rescue-the-model.md`, `docs/adr/0009-a-fused-gateway-is-supported.md`, the prototype above): Workflow graphs, Probe execution, LLM calls, Prompt versions, or fused gateways. **Invariant**: send the prompt as deployed, with no output schema, format reminder, or retry of a malformed or cut-off answer. Show a cut-off answer as extracted, labelled with how it stopped.
- **Deferred: scoring & Runs** (`docs/adr/0002-declare-formats-never-infer.md`, `docs/adr/0004-a-blank-cell-is-an-assertion.md`, `docs/adr/0006-judge-contract.md`, `docs/adr/0007-validity-is-structural-and-advisory.md`, `docs/adr/0008-a-re-attempt-is-a-new-run.md`): Read only when scoring or stored Runs start (v2 or later). Build none of it in v1.
- **Topology, Credentials, & Connector saves** (`docs/adr/0013-walking-skeleton-synchronous-saves.md`, `docs/adr/0005-credential-handling.md`, `docs/adr/0010-go-api-postgres-three-containers.md`, `docs/adr/0011-model-selection-belongs-to-the-connector.md`): Containers (`web` nginx + static SvelteKit, `api` Go HTTP over Postgres + `goose`; changes require an ADR), Credentials (read the 0005 and 0013 banners), model catalogs, or Connector saves. 0013 lists each deferred mechanism with the trigger that brings it back. **Invariant**: a Credential is encrypted at rest, sent only over https, and never returned, logged, or derived into a response; the `api` encrypts and never decrypts.
- **Outbound HTTP, migrations, & code standards** (`CODING_STANDARDS.md`): Outbound HTTP, migrations (`db/`), Go API (`cmd/`, `internal/`), frontend async/stores (`src/lib/`), or `Makefile`.
- **UI & design system** (`DESIGN.md`, `PRODUCT.md`): Svelte components, CSS, `Goldfin_Components/`, or `src/routes/`. For live layout iteration, run `pnpm dev` and `/impeccable live` (remove `src/routes/+layout.svelte` markers via `impeccable live-inject --remove`).
- **Issues & triage** (`docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`): GitHub issues or PRs via `gh`.

## Execution sequence

### 1. Scope (`seam`)

1. Deliver one feature seam and one layer per ticket and PR (`/to-spec` → `/to-tickets` → `/implement`; split multi-layer work via `/split-to-prs`).
2. **Door**: Classify the seam. **One-way** means it stores, transmits, or displays a Credential; writes Prompt versions, Run results, Verdicts, or Connector snapshots; or migrates data that already exists. Everything else is **two-way**: retries, timeouts, fences, queues, workers, caches, and UI async guards.
3. End `/to-spec` and each one-way ticket with a **Failure table** (two writers, mid-flight crash, mid-flight shutdown, timeout, stale result, rollback after data exists) holding only the rows the path can reach. A two-way ticket ships the synchronous, single-process version and records each deferred mechanism as a `ponytail:` note naming the trigger that brings it back.
4. **Product first**: Add no infrastructure seam (queue, worker, retry, fence, cache) until the walking-skeleton golden test passes: one real Document plus recorded provider responses, run through an OCR → LLM Workflow, produce a known displayed output. After that, each infrastructure ticket names the Run-path failure it prevents.
5. Cut `/to-tickets` at a single layer (Workflow executor, storage/migrations, API, or frontend store).
6. Implement UI strictly from `DESIGN.md` and OpenDesign handoffs; ask for the design artefact when absent.
- **Criterion**: Single-layer seam, door class, design artefact, and (one-way only) failure table are pinned before coding.

### 2. Build (`red` → green)

1. Drive `/implement` with `/tdd`: write a failing test at the seam and watch it go *red* before writing implementation code. Note any trivial-glue exemption in the PR description.
2. Verify module paths, config keys, and flags in `node_modules`, `go doc`, or Context7. Resolve dependency versions, action SHAs, and image digests via CLI commands.
3. Fix compiler, type, and lint errors at the root declaration or call site while keeping strict type and lint checks intact.
4. Migrate all callers and delete replaced functions in the same diff.
- **Criterion**: Every new behavior has a test that went red then green, and all callers use the new contract.

### 3. Verify & review (`sweep`)

1. **Sweep**: After a bug fix, grep Go and JS sides of the contract, the package, and sibling functions for the same defect and fix every match. Never sweep a mechanism into code that lacks it.
2. **Visual**: Capture Playwright screenshots at `375px` and `1280px` for UI changes and verify spacing against `DESIGN.md` tokens.
3. **Gate**: Run `make check` and resolve every failure until green.
4. **Review**, by door. CodeRabbit (`.coderabbit.yaml`) is the only hosted reviewer; OpenCodeReview runs locally only.
   - **One-way**: The local trio is the gate, run once each before push: self-review against `CODING_STANDARDS.md`, `/code-review` (Spec and Standards), `/open-code-review-delegate`.
   - **Two-way**: `make check` plus CodeRabbit. Reject a finding that adds a defensive mechanism (retry, token, fence, lease, hardening) with "two-way door; deferred as a `ponytail:` trigger", unless it is a `bug` or `security` finding.
   - **Both**: On the PR, fix `bug`/`security` findings and disposition every other finding in one batch (accept as a tracked issue, or reject with a one-line reason), in at most one fix round. Verify every applied finding against docs and `make check`, in commits touching only flagged lines. A finding that recurs after one round means the seam is wrong: simplify or ask.
5. **Handoff**: If work *outside* the seam remains, end with one question: `"Fix X too?"`
- **Criterion**: The door's review gate is green before push; external review closed after at most one fix round.
