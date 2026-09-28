# Single-writer Run execution on SQLite

A Run over N documents performs N OCR calls plus N LLM calls, and takes minutes to hours. We run it in a dedicated `worker` container — one process, bounded concurrency, all state in the database — against SQLite, rather than in the web server, behind a queue service, or on Postgres. Goldfin is single-tenant and single-user in v1, so the only thing that matters is that a Run survives a crash and a redeploy, and that the whole product installs as few moving parts as a customer's platform team can reason about.

> **Amended** — [How is a Dataset built, and what does it contain?](https://github.com/BasuruK/goldfin/issues/2) added a third service, **RustFS**, as a required object store for Document bytes. This ADR originally claimed the product "installs as two containers with no external services"; that clause is no longer true. The decision below is unaffected — see the last section.

## Considered Options

- **Laravel queue / Redis (Horizon)** — rejected. Adds a third service to an install whose entire value proposition is that a customer's platform team can run it, and buys horizontal scale that v1 rules out of scope.
- **Running the Run inside the web server** — rejected. A deploy would kill an hours-long job, and progress would have nowhere natural to live.
- **Postgres** — not rejected, just not yet needed. It costs a second container to size, back up and patch, and buys concurrent writers we deliberately do not have.

## Consequences

**SQLite is valid only while exactly one worker process writes.** This is an invariant, not a preference. Scaling the `worker` container to two replicas breaks it and requires Postgres. Anyone touching the deployment is expected to read this first.

The two containers split **web / worker**, never web / API. The built SPA ships inside the same image as the API so the bundle can never outrun the contract it calls. Node builds the frontend and does not ship: the production image carries no Node runtime.

**The single-writer invariant is a property of SQLite, not of the object store.** Document bytes live in RustFS, and `web` writing an upload while `worker` reads it is safe — S3 semantics handle concurrent readers and writers. The invariant still holds: exactly one process writes the database. Anyone who later swaps RustFS for another store, or who mistakes the object store for a shared-state boundary and scales `worker` to two replicas, has broken something — re-read this first.
