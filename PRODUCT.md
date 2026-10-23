# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit 3 with `adapter-static` and Vite 8 for the UI (`Goldfin_Components` consumed from source). Go API binary with two container roles (`web`, `api`), Postgres (goose migrations, plain `pgx` queries), and RustFS for Document bytes. Topology is ADR 0010 as amended by ADR 0013; the Pipeline (OCR → LLM → Verdict) is the next slice.

## Users

A single operator inside a financial organization—typically someone responsible for extraction quality, prompts, or internal platform configuration. They work alone in a single-tenant deployment: configure Connectors, build Datasets, run and compare extraction Runs, and read where the Pipeline lost value between OCR and LLM Stages.

## Product Purpose

Goldfin evaluates whether a system prompt and Connector setup reliably extract document Fields. It runs a Pipeline (OCR Stage, then LLM extraction Stage) over customer Datasets and produces scores and attribution so the operator can see which Stage failed—not to “fix” the model inside the product.

Success means defensible comparison between prompt versions and Connector configurations, with Runs that remain interpretable after Connectors or Credentials change.

**v1** (ADR 0014) is the first step toward that: the operator builds a Workflow of OCR, LLM and REST Connectors, runs it over one Document, and reads what each node extracted. There is no scoring and no stored history. The v1 shape is `prototypes/ocr only workflow/ocr-playground.html`. Datasets come in v2, and scoring after that.

## Positioning

Goldfin does not rescue the model. If a change makes the model more likely to succeed, the product is grading its own homework. The differentiator is honest attribution: which Stage lost the value, on the customer’s own Connectors and documents, with Connector definitions snapshotted per Run so later edits cannot rewrite history.

## Operating Context

Operators bring their own LLM and OCR endpoints via Connectors (including fused gateways). The work centers on Connector setup, Prompt versioning and Workflows in v1, then Dataset ingest, Run execution and comparison, never on Goldfin-hosted models. Terminology is fixed in `GLOSSARY.md`; ADRs in `docs/adr/` are binding for agents and implementers.

Current UI work follows design artefacts (`DESIGN.md`, OpenDesign handoffs) and ships one feature seam at a time (e.g. Connector screen before Runs).

## Capabilities and Constraints

- **Connectors**: Registered `ocr`, `llm`, and `fused` configurations; Credentials are encrypted at rest and never returned to the client; a save is one synchronous request with no save-time check yet (ADR 0013).
- **Workflows & Probes (v1)**: Any acyclic graph of Connector nodes over one Document; output is shown, not stored (ADR 0014).
- **Runs (v2+)**: Copy Connector definitions at start; re-attempts are new Runs, not repairs (ADR 0008).
- **API boundary**: The `api` encrypts Credentials and never decrypts one (ADR 0005, 0013).
- **Frontend**: Static SvelteKit; nginx proxies `/api` so the browser avoids CORS.
- **v1 gaps (explicit)**: `{{credential}}` interpolation and the REST connector's request template are decided but not built; the Workflow executor and Prompt versions are not built yet.

## Brand Commitments

Product name **Goldfin** with approved mark and wordmark in the shell. Voice is precise domain language from `GLOSSARY.md`—no invented synonyms for Connector, Run, Stage, Credential, etc. Visual implementation follows root `DESIGN.md` and `Goldfin_Components`; UI is implemented from design artefacts, not agent-improvised marketing chrome.

## Evidence on Hand

- `GLOSSARY.md`, `docs/adr/`, and `docs/design/feature-1-brief.md` for Connector screen scope.
- `DESIGN.md` and `Goldfin_Components/` as the incumbent design system.
- Home route uses **sample** Run rows for shell exercise only; Connector data in development may be local until API integration.
- Do not fabricate customer logos, benchmarks, compliance certifications, or production Run statistics.

## Product Principles

1. **One feature at a time**—finish a seam, verify, stop; ask before widening scope.
2. **Do not rescue the model**—measure and attribute; never optimize inside Goldfin for model success.
3. **Runs remember what Connectors were**—snapshots over live references for anything that affects scores.
4. **Design artefact wins**—implement from `DESIGN.md` and handoffs; two sources of truth drift.
5. **Say what was proven**—Connector checks and UI states must match verifiable depth (especially `fused`).

## Accessibility & Inclusion

Follow `DESIGN.md` integration requirements: visible focus (`:focus-visible`), keyboard operation, non-color state cues, coarse-pointer targets where specified, and theme-aware contrast goals (4.5:1 body, 3:1 large/essential graphics) assessed per theme. Compact 13px UI is intentional; iOS zoom-on-focus is an accepted trade-off documented in `DESIGN.md`.
