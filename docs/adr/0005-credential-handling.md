# A Credential is a named, versioned value that only the worker ever decrypts

A Connector carries a customer's key to their own internal platform. For a financial
institution that key is a lost customer if it reaches a log line, a support screenshot,
or a backup that leaves the building. This ADR settles where a Credential lives, what
is scrubbed, what is never returned, what happens to a Run when the key rotates, and
what Goldfin promises when it has done all of that correctly.

The load-bearing move is that a Credential is not a field in a Connector. It is a
**named stored value** that the Connector's request template *references*, so the value
exists in exactly one place and redaction is a property of the shape rather than a rule
somebody has to remember at a future refactor.

## Storage

Encrypted at rest with the framework's own cast, keyed by `APP_KEY` from the
environment. This defends the SQLite file, backups, and image layers.

It does **not** defend a compromised host. An attacker holding the container
environment already holds the key, and this ADR does not pretend otherwise — the
promised set is written out below precisely so the limit is stated by us rather than
discovered in an audit.

## Shape

A Connector's stored request carries `{{credential}}` in its URL, its headers, or its
body template. The placeholder is substituted at the last possible moment before the
call. The auth header is therefore not a special case — it is one more place a
placeholder can appear, which is what makes redaction uniform.

A URL carrying a credential-shaped query parameter (`api_key`, `token`,
`access_token`, `sig`, `key`, `subscription-key`, `X-Amz-Signature`) is **refused at
save time**, with a message naming the placeholder. Detection is a heuristic and a URL
is the one surface that leaks by default — into proxy records, referrers, and the
customer's own gateway access log — so a hard edge is the right trade here.

## Where plaintext may exist

In exactly two places: **the request that creates it**, and **worker memory during a
call**. The `web` container accepts a credential and never decrypts one. Every outbound
call, including a Connector test, is executed by the worker.

This is why the test runs in the worker even though it means a test issued during an
hours-long Run waits for a slot. The price is latency; the return is that the
internet-facing container never holds a decrypted secret. `web` still holds `APP_KEY`
— it needs it for session and cookie signing, and to encrypt on write — so this is a
constraint on what `web` *decrypts*, not on what it is permitted to hold.

## Redaction

Two layers, because one of them is not enough.

1. **Structure.** The outbound client never hands an interpolated request to a logger,
   and a Connector test result is a fixed shape — status, latency, whether the response
   path resolved, the key's label. **The response body is never returned.** A gateway
   that reflects the auth header back is a real shape, and it is exactly how a
   customer's own key comes home into our UI.
2. **Backstop.** A central scrubber over the log channel and the exception renderer,
   matching every outgoing string against the plaintext values the worker currently
   holds. There are a handful of credentials, so this costs nothing, and it is the only
   thing that survives a third-party library printing its own exception with the request
   attached — `cURL error 28: … for https://host/v2?api_key=…` is not a hypothetical.

## Retrieval

**Nothing derived from a value ever returns to a client.** Not a last-4, not a hash
prefix, not a length. The only thing the API gives back is a `set_at` timestamp, and the
edit form shows an empty field with an "unchanged" marker. A fingerprint would be safe
only for a high-entropy key, and Goldfin cannot know whether the customer's key is a
40-character random string or a passphrase — "indefensible the first time" is a bad
property for a security centre to have.

## Lifecycle

Generations are **immutable**. Rotation appends one and marks the previous `superseded`;
it never rewrites. A **Run pins the generation it began with** and records it, so a
mid-Run rotation touches nothing already running.

Pinning is what forces immutability, and the reason is the crash. ADR 0001 requires a
Run to survive a worker crash and resume; resuming means reading a value that is no
longer current. A mutable "current key, with history" cannot do that. Immutable
generations can, and they are the same shape as `Prompt version` and `Dataset version`
— no new concept.

A generation a Run references **cannot be destroyed**. An unreferenced one can be
**tombstoned**: the id and the customer label stay, the value goes, and a replay that
needs it fails loudly saying so. Nothing that shaped a score is silently destroyed, and
a burned key can actually be burned — "the key you burned is immortal in our database
forever" ends the security conversation before it starts.

Every generation carries a **required** customer-supplied label. Without one the UI can
only say "generation 2", and at 4pm on a Friday a fault line that says which key failed
is the single most useful line the product produces.

## Considered Options

- **A separate customer-generated key, independent of `APP_KEY`** — rejected. It
  isolates a Laravel or cookie compromise from the connector keys, at the cost of one
  more secret for the customer's platform team to create, store and rotate. A security
  team will not ask whether it is a different key from the app key; they will ask
  whether it is encrypted at rest. We can answer that without the second key.
- **Plaintext in SQLite, defended by redaction alone** — rejected. It makes the
  database exactly as sensitive as the customer's document vault, which it partly
  already is, and the second adversary disappears from the promise.
- **A credential slot in the auth header only** — rejected. It refuses gateways that
  only accept a query key, and it leaves the URL as an unchecked secret-bearing surface.
- **Live rotation, no pinning** — rejected. Free until someone rotates a key at 4pm on
  a Friday, and then half a corpus is scored under key v1 and half under v2 with nothing
  recording it, which silently corrupts the Comparison the product exists to produce.
- **Retain every generation forever, no hard delete** — rejected as unlosable. A bank
  will not accept that a burned key is immortal in the database.
- **A standalone Credential entity shared by Connectors** — rejected. v1 has no
  fallback-credential story and no second referrer, and a standalone entity with one
  referrer is speculative. The cost is real but small: a customer whose platform team
  hands out one key for both connectors rotates it twice, and the two Connector screens
  can drift apart.
- **A last-4 fingerprint in the API** — rejected. Safe only for a high-entropy value,
  and Goldfin cannot know the entropy.

## Consequences

- **A revoked key stays in use until the Run ends.** Bounded, because a Run is bounded
  in time and Cancel already exists. The alternative — halting every in-flight Run on
  rotation — makes an ordinary scheduled rotation a destructive event.
- **`Attestable` survives; re-execution is the weaker claim.** A Verdict is frozen with
  its inputs, so a score can always be read back. Re-running it is a new Run, and a new
  Run against a tombstoned generation fails rather than silently succeeding with
  different inputs.
- **The Connector's storage shape is frozen.** `{{credential}}` interpolation is
  referenced from URLs, headers and bodies alike, so adding a fourth place later is not
  a schema change.
- **Ownership is per-Connector.** One credential per Connector, generations hanging off
  it.
- **Redaction has a permanent obligation.** The scrubber is the only thing standing
  between a dependency that prints its own exception and a customer's key. It is not
  optional hardening and must not be treated as a feature that can be switched off.

## What Goldfin promises

Stated in full, because a vague claim is worse than a narrow one.

**Goldfin promises** that a Credential is encrypted at rest under `APP_KEY`; that a
plaintext value exists only in the request that creates it and in worker memory during a
call; that the `web` container never decrypts one; that no part of a value is ever
returned to a client, only a `set_at`; that no Connector test returns a response body;
that a URL carrying a credential-shaped query parameter is refused; that every string
leaving the log channel and the exception renderer is scrubbed; that a Run in flight
keeps the generation it started with; and that a generation a Run has referenced cannot
be destroyed, while an unreferenced one can be.

**Goldfin does not promise** to survive a compromised host, a leaked `APP_KEY`, a leaked
worker memory dump, or a malicious dependency executing inside the worker process. It
does not promise to defend a database backup taken without its `APP_KEY`; a backup is
only as safe as the key stored beside it. And it does not promise that a customer's
platform team cannot see a key in a gateway's own access log — the query-parameter
refusal is a guard rail, not a control over systems Goldfin does not run.

## Out of scope here

A customer gateway that performs OCR **and** the LLM in a single POST, returning both,
is already covered credential-wise — an `X-Api-Key` header is an ordinary header, and a
Connector with no credential at all is legal. But it breaks a different premise: the
Pipeline is split into two Stages precisely so a failure can be attributed, and in that
shape the system prompt lives inside the customer's gateway with no separable OCR result
to attribute against. That is a Pipeline decision, not a credential one, and it is
tracked on the wayfinder map.
