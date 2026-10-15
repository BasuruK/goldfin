# Coding standards

Apply every rule in the touched layer before writing code, and verify every diff hunk against it at review. Judgement calls only: anything a linter can decide belongs in `make check` (`.golangci.yml`, `svelte-check`, `knip`, tests).

## Outbound HTTP (worker)

The destination is user-supplied; treat every call as hostile:

- **Single client**: Route all outbound calls through the single hardened `http.Client` in `internal/provider`.
- **SSRF table**: Drive blocked-address checks from a table-driven `netip` predicate test; add new ranges as table rows.
- **Redirects**: Restrict redirects to same-host with a bounded hop limit.
- **Body cap**: Enforce a response body-size cap that returns an explicit error when exceeded.
- **Verified response**: Require both a `2xx` status and a response body that parses into the expected shape.
- **URL construction**: Build URLs exclusively with `url.Parse` and `JoinPath`.
- **Time budget**: Bound a job's total time budget strictly below the stale-reclaim window.

## State transitions (jobs, claims, migrations)

Verify every state transition against the ticket's **Failure table** (`AGENTS.md`):

- **Claim token**: Match the active claim token on completion writes and require `rowsAffected == 1`.
- **Shutdown release**: Interrupt in-flight jobs on shutdown and release their claims for re-run.
- **Down migration**: Write `Down` migrations that succeed against rows produced by the `Up` path.
- **Schema effect**: Keep only migrations that mutate schema state.
- **Resource ownership**: Assign every opened resource (pool, body, listener) a single owner that closes it.

## Frontend async

- **Guarded fetch**: Pass an `AbortSignal` and timeout to every `fetch`, guard `.json()`, and route failures through the single error mapper with distinct timeout and reachability messages.
- **Request token**: Guard async completions with a per-request token rather than a connector-wide revision.
- **Reactive state**: Hold UI-driving state in reactive Svelte state (`$state` / `$derived`).
- **Optimistic rollback**: Pair every optimistic update with a rollback path and clear prior failure messages on success.
- **Mapped errors**: Surface only mapped user-facing messages in the UI.
- **Client credentials** (`docs/adr/0005-credential-handling.md`): Keep Credential plaintext in the creating request and worker memory only; the interim `localStorage` copy in `storage.js` is retired with the worker-backed slice.

## Contracts across layers

- **Single constant**: Define each shared constant (API path, default address, timeout, state name) in one source file.
- **Startup config**: Use one config variable per concept in full URL form, validated once at startup with explicit failure on missing or malformed values.
- **Direct recipes**: Run foreground commands directly in `Makefile` recipes; delegate process orchestration to Docker Compose or Go.
- **Round-trip fields**: Produce every client-read field in the worker, and persist or reject every API-accepted field.
- **Unambiguous state**: Give each state value one meaning across all paths, reserving `ready` for checks that succeeded.
- **Payload assertions**: Assert request payloads inside test mocks so contract drift fails tests.
- **Caller-neutral errors**: Keep shared helpers free of caller-specific labels by naming the active operation in error messages.

## Accepted for v1

Settled for v1 (widening either requires an ADR):

- **Loopback API** (`docs/adr/0012-worker-checks-gate-connector-saves.md`): Local development binds loopback without auth; production access and authentication land in a later slice.
- **Single-writer `updated_at`**: `internal/jobs/store.go` is the sole writer; add a database trigger when a second writer is introduced.
