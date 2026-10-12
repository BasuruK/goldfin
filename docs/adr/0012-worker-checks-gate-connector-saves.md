# Worker checks gate Connector saves

The Connector UI is finished and accepted before backend implementation. The first
backend slice delivers checked Connector saves in local development, with host access
restricted to loopback. [Issue #31](https://github.com/BasuruK/goldfin/issues/31) remains
the parent; implementation is split into small, tested, reviewable tickets.

## Save contract

The form uses **Save / Cancel**, replacing per-keystroke persistence. Edits stay in
memory until Save. Proposed changes are staged in Postgres; the API returns an attempt
handle, one worker initially performs the check, and the UI polls queued, running and
finished states. Checks have a bounded timeout. The API never calls providers or
decrypts Credentials, per [ADR 0005](0005-credential-handling.md) and
[ADR 0010](0010-go-api-postgres-three-containers.md).

Only a successful check commits the proposed Connector configuration and any new
Credential generation in one transaction. A failed create adds no active Connector;
a failed edit leaves the previous configuration unchanged. The dialog retains the
draft and shows the failure. There is no automatic fallback to an old Credential.

## First providers

- **OpenAI:** Save requires a successful minimal completion using a manually supplied
  real model ID. The finding records the checked ID; this does not automatically
  enable that model for Runs.
- **Web Request:** Save requires a successful worker HEAD check returning 2xx. The
  finding is labelled **Reachable**, not Connected or verified: it proves neither
  Credential validity nor model capability. The Credential is optional; when supplied
  it uses `Authorization: Bearer`, otherwise no auth header is sent. Custom `X-*`
  headers belong to v2. POST-only gateways need request-method/body support in a
  later slice before they can pass this gate.

Other providers remain visibly unavailable for saving until their checks are
implemented. Preview models remain a labelled development preview; sample IDs never
enter the database or a live Run.

## Credentials and deletion

Credentials are encrypted at rest and never returned to the browser. The edit form
shows an empty replacement field marked **unchanged**. Setting or replacing a
Credential requires a customer-supplied label. Replacement silently appends an
immutable generation and repeats the Save check; no history-management UI is needed
in this slice. Generation pinning remains governed by ADR 0005.

Deleting a Connector removes it from the active list and tombstones its unreferenced
Credential generations: IDs and labels remain, encrypted values are cleared. There
is no archive screen. Protection for Run-referenced generations must be implemented
with Runs, before those references can exist.

## Delivery boundary

The first schema contains Connectors, Credential generations and pending Save
attempts. Postgres supplies the worker handoff; no additional queue service is added.
Legacy localStorage data is reset only through an explicit user action after a clear
notice, with Credentials entered again; no migration tool is built.

Live catalog discovery, model persistence, Runs, RustFS wiring and production access
and authentication are later slices. The selected model remains part of a Run's
resolved Connector definition under [ADR 0011](0011-model-selection-belongs-to-the-connector.md)
and [ADR 0008](0008-a-re-attempt-is-a-new-run.md). New logic needs tests; each ticket
stays within its feature seam.
