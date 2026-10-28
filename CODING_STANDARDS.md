# Coding standards

Apply every rule in the touched layer before writing code, and verify every diff hunk against it at review. Judgement calls only: anything a linter can decide belongs in `make check` (`.golangci.yml`, `svelte-check`, `knip`, tests).

These rules govern mechanisms that exist. None of them is a reason to build one: a queue, worker, fence, lease, or hardened dialer is added only when `docs/adr/0013-walking-skeleton-synchronous-saves.md` names its trigger as met.

## Outbound HTTP

The operator supplies the destination (ADR 0013 threat model):

- **Client**: Use a stdlib `http.Client` with a `Timeout`. Rely on its default redirect policy, which drops `Authorization` on a redirect to another domain.
- **Credential transport**: Send a Credential only over `https`, and never in a URL.
- **Body cap**: Read responses through `io.LimitReader` and return an explicit error when the cap is hit.
- **Errors**: Map transport errors to fixed messages; never log or return a request, a URL with its query, or a response body.
- **URL construction**: Build URLs exclusively with `url.Parse` and `JoinPath`.
- **Response shape**: Treat a malformed model response as a scored result, not a reason to retry (ADR 0003).

## Go nil & error handling

- **Validate only at public boundaries**: Nil-check at JSON unmarshal, `multipart` parts, and `pgx` scans. Trust constructor output, and trust a struct passed by value only for its value fields: by-value proves the outer struct is not a nil pointer, not that its pointer, slice, map, or interface fields are set. On a slice or `[]byte`, use `len()`, not `!= nil`.
- **Check once, delete the echo**: Do not re-check a value that this function already nil-checked, that a constructor validated, or that `pgx` scanned non-NULL two lines above. A guard kept as insurance against a value already proven is noise.
- **Delete a guard only when the guarantee is structural**: "An earlier function checks it" is not a guarantee — Go has no non-null type, and any new caller can pass `nil` without a compile error. Remove the guard only when the guarantee is enforced by an unexported type with a validating constructor, a non-pointer value field whose siblings the constructor also validates, or a single caller. A by-value struct alone is not enough: it proves only the outer value, not its pointer, slice, map, or interface fields. Otherwise keep it and make the guarantee structural first.
- **Nil is not a sentinel**: Never use `nil` to mean "absent" or "not yet set" when a zero-length value is legal, because a reader of zero bytes returns an empty, non-nil slice. Use an explicit `bool`.
- **Collapse untrusted errors at the outbound boundary**: Map transport and provider errors to a fixed message (`requestFailure`). Never `%w`-wrap an error whose text can carry a DSN, a URL with its query, or a Credential (Outbound HTTP above, ADR 0013).
- **Wrap with `%w` only for chain inspection**: Wrap where a caller inspects the cause with `errors.Is`/`errors.As`, and where neither the DSN nor the Credential can reach the message.
- **Never log and continue**: Return or collapse an error at once; never carry on with partial state.
- **No `recover()`**: Let a panic fail the process. A top-level HTTP middleware is the only place recovery is allowed.

## State transitions (jobs, claims, migrations)

When a ticket has a **Failure table** (`docs/agents/landing.md`, one-way seams only), verify every transition against it:

- **Claim token**: If a job claim exists, match the active claim token on completion writes and require `rowsAffected == 1`.
- **Shutdown release**: If a job runs in the background, interrupt it on shutdown and release its claim for re-run.
- **Down migration**: Write `Down` migrations that succeed against rows produced by the `Up` path.
- **Schema effect**: Keep only migrations that mutate schema state.
- **Resource ownership**: Assign every opened resource (pool, body, listener) a single owner that closes it.

## Frontend async

- **Guarded fetch**: Pass a timeout signal to every `fetch`, guard `.json()`, and route failures through the single error mapper in `src/lib/connectors/api.js`, with distinct timeout and reachability messages.
- **Late replies**: Before a completion mutates UI, check that the draft it belongs to is still open. Add a per-request token only where a slow reply can overwrite a newer one.
- **Reactive state**: Hold UI-driving state in reactive Svelte state (`$state` / `$derived`).
- **Optimistic rollback**: Pair every optimistic update with a rollback path and clear prior failure messages on success.
- **Mapped errors**: Surface only mapped user-facing messages in the UI.
- **Client credentials** (`docs/adr/0005-credential-handling.md`): Keep Credential plaintext in the creating request only. `storage.js` clears the legacy `localStorage` store on every load.

## Contracts across layers

- **Single constant**: Define each shared constant (API path, default address, timeout, state name) in one source file.
- **Startup config**: Use one config variable per concept in full URL form, validated once at startup with explicit failure on missing or malformed values.
- **Direct recipes**: Run foreground commands directly in `Makefile` recipes; delegate process orchestration to Docker Compose or Go.
- **Round-trip fields**: Persist or reject every API-accepted field, and serve every client-read field from what was persisted.
- **Unambiguous state**: Give each state value one meaning across all paths, reserving `ready` for checks that succeeded.
- **Payload assertions**: Assert request payloads inside test mocks so contract drift fails tests.
- **Caller-neutral errors**: Keep shared helpers free of caller-specific labels by naming the active operation in error messages.

## Accepted for v1

Settled for v1 (widening either requires an ADR):

- **Loopback API** (`docs/adr/0013-walking-skeleton-synchronous-saves.md`): Local development binds loopback without auth; production access and authentication land in a later slice.
- **Last write wins** (`docs/adr/0013-walking-skeleton-synchronous-saves.md`): One operator, create-only Connectors. Add an optimistic fence when edits ship and a second operator exists.
