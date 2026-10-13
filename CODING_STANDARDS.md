# Coding standards

Read at review, against the diff. Judgement calls only: anything a linter can decide lives in
`make check` (`.golangci.yml`, `svelte-check`, tests), not here. Evidence for each section is the
review history of PRs #32, #38, #39 and #40.

## Outbound HTTP (worker)

The destination is user-supplied, so every call is hostile until proven otherwise.

- One hardened client in `internal/provider`. A second `http.Client` is a finding.
- A table-driven test covers the blocked address ranges, built on `netip` predicates. A new range
  is a new row, never a new `if`.
- Redirects: same-host only, with a hop limit.
- Responses: a body-size cap that errors loudly when exceeded, never truncates silently.
- Success: a 2xx status plus a body that parses into the expected shape. A status code alone proves
  nothing.
- URLs: build with `url.Parse` and `JoinPath`. String concatenation is a finding.
- Budgets: a job's total time budget sits below the stale-reclaim window.

## State transitions (jobs, claims, migrations)

Every state machine ships a **failure table** in its ticket: two writers, a crash mid-flight, shutdown
mid-flight, a stale reclaim, a rollback after data exists. Review checks the code against that table.

- A write that finishes a claim matches the claim token and checks rows affected. A zero count is an
  error.
- Shutdown interrupts a job and releases it. It never records it as failed.
- A Down migration runs against data the Up path produced.
- A migration with no schema effect is deleted.
- Every opened resource (pool, body, listener) has an owner that closes it.

## Frontend async

- Every `fetch` carries an `AbortSignal` and a timeout, a guarded `.json()`, and routes its error
  through the single mapping function. A timeout is never reported as "API unreachable".
- A result is guarded by a per-request token. A per-connector revision is too coarse.
- State that drives the UI is reactive. A plain `Map` or module variable is a finding.
- An optimistic update has a rollback, and the success path clears the previous failure message.
- Users see mapped messages. Raw `TypeError` or `SyntaxError` text is a finding.
- Credentials follow [ADR 0005](docs/adr/0005-credential-handling.md): plaintext exists only in the
  creating request and in worker memory. A credential in `localStorage` is a violation, not a trade-off.

## Contracts across layers

- One source per constant: API paths, default addresses, timeouts, state names. A value repeated in
  two files is a finding.
- A field the client reads must be produced by the worker, and a field the API accepts must be
  persisted or rejected. Check both directions.
- A state value means the same thing on every path. `ready` is never returned for a failed check.
- Mocks assert the request payload, so contract drift fails a test.
- A shared function carries no feature-specific wording. A verification timeout never says "discovery".

## Dead and speculative code

- Every new function has a caller or a test that needs it. A helper for a "planned" flow is deleted.
- A migration of callers deletes the old function in the same diff.
- A computed value nobody reads is deleted.

## Accepted for v1

Do not raise these again. A change that widens them goes through an ADR.

- **No authentication on the API.** It listens on loopback in local development. Production access
  and authentication are later slices ([ADR 0012](docs/adr/0012-worker-checks-gate-connector-saves.md)).
- **`updated_at` has no trigger.** `internal/jobs/store.go` is the single writer. Add a trigger when a
  second writer appears.
