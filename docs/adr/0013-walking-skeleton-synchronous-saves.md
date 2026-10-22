# Walking skeleton: a Connector is saved with one INSERT, and there is no worker yet

Goldfin had 5,500 lines for saving one Connector and none for the Pipeline it exists to score. The save path was
async because [ADR 0005](0005-credential-handling.md) sent every outbound call to a worker and [ADR 0010](0010-go-api-postgres-three-containers.md)
made a Connector check a queued job. [ADR 0012](0012-worker-checks-gate-connector-saves.md) then gated every save on
that check. Each async step added a Failure-table mechanism: staged attempts, leases, claim tokens, expiry, revision
fences, credential generations, a hardened dialer, and request tokens in the UI. Every one of them is reliability
machinery for a form submit.

This ADR supersedes 0012 and amends 0010 and 0005. A Connector save is one synchronous `INSERT`. There is no save-time
check and no `worker` container. The deployment is two containers (`web`, `api`) over Postgres. The mechanisms below
are deferred, and each one names the trigger that brings it back.

## Threat model

Single tenant, single operator, internal network. The assets are the provider keys, the customer's documents, and Run
results that must stay `Attestable`. The realistic adversaries are passive or accidental: a key in a log line, an error
message, a screenshot, git, browser storage, or a database dump taken without `APP_KEY`; a key sent in cleartext; a
Run result that silently changes meaning after a Connector edit. With one operator, "two writers" means two tabs, and
last-write-wins is acceptable for configuration. It is not acceptable for Run results. SSRF needs someone other than
the operator to supply a URL, and nobody does. A compromised host stays out of scope, as ADR 0005 states.

## One-way doors, kept

These are expensive or impossible to add after the fact, so they hold now:

- **Encrypted at rest**: `secretbox` (AES-GCM, `APP_KEY`) before the `INSERT`.
- **Never returned or derived**: the API returns only `credentialLabel` and `credentialSetAt`.
- **Never in cleartext transport or a URL**: a Credential requires `https`, and credential-shaped query parameters are refused.
- **Never left in browser storage**: the legacy `localStorage` store is cleared on every load, without a prompt.
- **Run snapshot and frozen Verdicts** ([ADR 0008](0008-a-re-attempt-is-a-new-run.md), [ADR 0002](0002-declare-formats-never-infer.md)):
  built with the first Run as an INSERT-only Run row, never on the save path.

## Deferred, with triggers

| Mechanism | Comes back when |
|---|---|
| Queued save-time check (staged attempts, lease, claim token, expiry) | A check must outlive one HTTP request (>30 s), or must wait behind a Run. |
| `worker` container | A Run must survive an `api` deploy, or the API listens beyond loopback/internal. Until then, the `api` process encrypts and the Run path decrypts in-process. |
| Revision fence on edit | Edits ship and a second operator exists. Until then, Connectors are create-only. |
| Immutable Credential generations, supersede, tombstone | A Run must re-execute on an old key, or a key a Run references must be burned. Until then, a Run snapshot records which Credential it used. |
| SSRF dial guard, custom redirect policy, DNS and fallback budgets | Someone other than the operator can supply a URL. |
| Transport retry for 429/5xx/timeouts (ADR 0003 allows it) | A multi-Document Run fails on transient errors. |
| `sqlc` | More than about ten queries, or the Verdict schema grows. |
| Per-request tokens in the UI | A slow reply can overwrite a newer one (search-as-you-type, concurrent saves). |

## Consequences

- **The save flow is three files**: `ConnectorDialog.svelte` calls `saveDraft()` in `store.svelte.js`, which calls
  `createConnector()` in `api.js`. That posts to `internal/api/server.go`, which validates, encrypts, runs one `INSERT`,
  and returns `201`.
- **The staged-Save schema is dropped, not migrated.** It only ever held loopback development data.
- **The ADR 0005 invariant narrows**: the `api` encrypts and never decrypts. "Only the worker decrypts" returns with the worker.
- **A broken Connector is found by its first Run**, not at save. Every Run records what it called, so this is visible rather than silent.
- **Process**: `AGENTS.md` classifies each seam as a one-way or two-way door. Failure tables and the full review trio
  apply only to one-way seams, and no infrastructure seam ships before the walking-skeleton golden test passes.
