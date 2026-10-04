# Go API, Postgres, and three containers in one image

[Issue #4](https://github.com/BasuruK/goldfin/issues/4) settled Laravel over SQLite. Both are
replaced. The API layer is **Go**, the database is **Postgres**, and the product deploys as
**three containers from one image**: `web` (nginx + the static SvelteKit build), `api` (the
JSON API), and `worker` (the same Go binary under a different subcommand). RustFS remains
the required object store for Document bytes, per issue #2.

This supersedes [ADR 0001](0001-single-writer-run-execution-on-sqlite.md).

## Considered Options

- **SQLite**: rejected. A Verdict is frozen with both raw and both normalized values plus
  the resolved chain, and raw connector payloads are a JSONB question still open on ticket
  [#15](https://github.com/BasuruK/goldfin/issues/15). SQLite makes JSONB a string and costs
  a second container to size, back up and patch, the exact cost ADR 0001 spent a paragraph
  arguing against, now spent for a reason that did not exist when it was written.
- **Laravel**: rejected. The domain logic is plain: five `Match` outcomes, conditions on a
  frozen record, a fixed denominator. It wants to be ordinary Go with ordinary tests.
- **GORM / ent**: rejected. Both let the Go struct and the real column drift apart silently,
  and drift in a schema that produces numbers sold to a regulated buyer is not a small
  thing. `sqlc` keeps SQL the source of truth and makes the compiler check the queries.
- **`adapter-node` for SvelteKit**: rejected. Node builds the frontend and does not ship,
  which ADR 0001 already said and which a three-container split makes free: nginx serves the
  static build and proxies `/api`, so `web` and `api` share one origin and the browser never
  meets a CORS problem.
- **Two containers, `web / worker` as ADR 0001 had it**: rejected in favour of separating
  the UI from the API. This is the deliberate reversal of ADR 0001's "never web / API" clause,
  taken for architectural cleanliness and accepted at the cost of a third container.

## Consequences

- **One binary, three roles.** `web` is nginx and static files. `api` serves HTTP. `worker`
  runs the same binary with a different subcommand. There is one build and one Dockerfile
  target set, so the three containers cannot drift out of sync with each other.
- **The `api` container never makes an outbound call and never decrypts a Credential.** This
  is [ADR 0005](0005-credential-handling.md)'s invariant, restated for the new topology: it
  used to be "`web` never decrypts", and it is now "`api` never decrypts".
- **A Connector check is an asynchronous job, not a request.** ADR 0005 already requires every
  outbound call (a Connector test included) to be executed by the worker, so a check
  crosses a container boundary and cannot be a synchronous `POST` that returns a result. The
  API returns a handle, the worker runs the call, the client polls. **This is a UI state, not
  an implementation detail**: queued, running, and finished are three different things and the
  Connector screen has to draw all three.
- **Migrations are goose, queries are sqlc.** Schema changes are versioned files; the Go
  structs they generate are checked against the database at build time.
- **No Node runtime ships**, and no single-writer invariant constrains the database. The
  worker-count restriction ADR 0001 existed to impose is gone with SQLite.
