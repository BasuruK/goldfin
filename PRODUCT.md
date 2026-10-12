# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit 3 with `adapter-static` and Vite 8 for the UI (`Goldfin_Components` consumed from source). Go API binary with three container roles (`web`, `api`, `worker`), Postgres (goose migrations, sqlc queries), and RustFS for Document bytes. Target topology is settled in ADR 0010; backend and worker paths are largely ahead of the current UI slice.

## Users

A single operator inside a financial organization—typically someone responsible for extraction quality, prompts, or internal platform configuration. They work alone in a single-tenant deployment: configure Connectors, build Datasets, run and compare extraction Runs, and read where the Pipeline lost value between OCR and LLM Stages.

## Product Purpose

Goldfin evaluates whether a system prompt and Connector setup reliably extract document Fields. It runs a Pipeline (OCR Stage, then LLM extraction Stage) over customer Datasets and produces scores and attribution so the operator can see which Stage failed—not to “fix” the model inside the product.

Success means defensible comparison between prompt versions and Connector configurations, with Runs that remain interpretable after Connectors or Credentials change.

## Positioning

Goldfin does not rescue the model. If a change makes the model more likely to succeed, the product is grading its own homework. The differentiator is honest attribution: which Stage lost the value, on the customer’s own Connectors and documents, with Connector definitions snapshotted per Run so later edits cannot rewrite history.

## Operating Context

Operators bring their own LLM and OCR endpoints via Connectors (including fused gateways). Workflows center on Connector setup, Dataset ingest, Prompt versioning, Run execution, and comparison—not on Goldfin-hosted models. Terminology is fixed in `GLOSSARY.md`; ADRs in `docs/adr/` are binding for agents and implementers.

Current UI work follows design artefacts (`DESIGN.md`, OpenDesign handoffs) and ships one feature seam at a time (e.g. Connector screen before Runs).

## Capabilities and Constraints

- **Connectors**: Registered `ocr`, `llm`, and `fused` configurations; Credentials are separate entities, never returned to the client; Connector checks run on the worker as queued jobs with findings, not bare pass/fail.
- **Runs**: Copy Connector definitions at start; re-attempts are new Runs, not repairs (ADR 0008).
- **API boundary**: The `api` container does not make outbound calls or decrypt Credentials; the worker does (ADR 0005, 0010).
- **Frontend**: Static SvelteKit; nginx proxies `/api` so the browser avoids CORS.
- **v1 gaps (explicit)**: Credential encryption and `{{credential}}` interpolation are decided but not fully implemented; Connector UI may use local persistence until the API lands.

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
