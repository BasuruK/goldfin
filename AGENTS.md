# Goldfin

Goldfin evaluates a financial organization's system prompt for document field extraction. It runs a
Pipeline — OCR, then LLM extraction — over a customer-built Dataset and produces scores that say which
Stage lost the value. Single tenant, single user.

## The stack

Settled in [ADR 0010](docs/adr/0010-go-api-postgres-three-containers.md). Do not re-litigate without a
new ADR.

- **API**: Go. One binary, three container roles — `web` (nginx + static SvelteKit), `api` (JSON
  HTTP), `worker` (same binary, different subcommand). One image.
- **Database**: Postgres. Migrations are goose; queries are sqlc. An ORM is not to be introduced.
- **Object storage**: RustFS, required, for Document bytes only.
- **Frontend**: SvelteKit, `adapter-static`. No Node runtime ships. nginx proxies `/api`, so the
  browser never meets CORS.
- **The `api` container never makes an outbound call and never decrypts a Credential.** Every call
  goes through the worker. See [ADR 0005](docs/adr/0005-credential-handling.md).

## How we work

These are the rules that keep the product small. Breaking them is how it got complicated before.

**One feature at a time.** A feature is one seam — the Connector screen, the Dataset ingest, the Run
view. Build it, verify it, stop. Do not widen into adjacent cleanup, speculative endpoints, or
infrastructure nobody asked for. If an idea is worth doing but is not this feature, **park it out loud**
and move on. Absorbing it silently is the failure mode, not having it.

**UI first, and the design is not yours.** The user designs in OpenDesign and hands over `DESIGN.md`,
frames, images and instructions. Implement from that artefact. **Never scaffold a throwaway UI
prototype** when a design artefact exists — two sources of truth will drift, and the design is the
one he is looking at. Ask for the design file; do not offer to design it.

**The flow.** Per feature: `/to-spec` (scope: this feature only) → `/to-tickets` → `/implement` per
ticket. `/implement` drives `/tdd` and closes with `/code-review`. Wayfinder is done; its decisions
live in `GLOSSARY.md` and `docs/adr/`, and they are binding.

**A test for new logic.** New domain logic needs a test. Trivial glue is exempt — say why in the PR
description rather than silently skipping it.

**Say what you parked.** Every turn that leaves something undone says so in one line. Silent omission
is how a scope creeps.

## Before you touch something

`GLOSSARY.md` is the glossary and it is strict. Use its terms; do not invent synonyms, and do not use a
word it reserves for something else. The load-bearing ADRs:

- **[0003](docs/adr/0003-goldfin-does-not-rescue-the-model.md)** — Goldfin does not rescue the model.
  If a change makes the model more likely to succeed, it is grading its own homework. Load-bearing for
  everything touching the LLM call.
- **[0005](docs/adr/0005-credential-handling.md)** — Credential storage and lifecycle. **Its
  obligations are decided but largely unimplemented in v1** — read the amendment banner.
- **[0008](docs/adr/0008-a-re-attempt-is-a-new-run.md)** — a re-attempt is a new Run, and a Run copies
  the Connector definition it used.
- **[0009](docs/adr/0009-a-fused-gateway-is-supported.md)** — a fused gateway is supported, not
  degraded. **Standing instruction: the premise that a Connector must be splittable is gone from the
  model, and no future ticket may re-derive it.**

## Agent skills

### Issue tracker

Issues are tracked as GitHub issues in `BasuruK/goldfin` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
