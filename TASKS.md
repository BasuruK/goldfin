# PR #38 recovery plan

Status: T0/T1 settled; T2 is published as draft [PR #44](https://github.com/BasuruK/goldfin/pull/44), with local checks/reviews complete and CI pending. It is not merged; later layers remain queued. Update this file as each task finishes, recording commands, results, and remaining blockers.

## Objective and sources

Recover useful code from [PR #38](https://github.com/BasuruK/goldfin/pull/38) through single-layer replacement PRs based on current `main`, following the checked-Save delivery sequence. Keep #38 available as source material; live discovery remains deferred. This replaces the original request to merge main into the existing cross-layer PR and repair it in place. Each replacement must pass current checks and contain only code needed for its accepted behavior.

Authority: [AGENTS.md](AGENTS.md), [CODING_STANDARDS.md](CODING_STANDARDS.md), [GLOSSARY.md](GLOSSARY.md), [DESIGN.md](DESIGN.md), ADRs [0005](docs/adr/0005-credential-handling.md), [0010](docs/adr/0010-go-api-postgres-three-containers.md), [0011](docs/adr/0011-model-selection-belongs-to-the-connector.md), and [0012](docs/adr/0012-worker-checks-gate-connector-saves.md).

Product sources: [parent #31](https://github.com/BasuruK/goldfin/issues/31) and checked-Save children [#33](https://github.com/BasuruK/goldfin/issues/33), [#34](https://github.com/BasuruK/goldfin/issues/34), [#35](https://github.com/BasuruK/goldfin/issues/35), [#36](https://github.com/BasuruK/goldfin/issues/36), [#37](https://github.com/BasuruK/goldfin/issues/37). PR #38 has no description; its original `TASKS.md` describes discovery-only delivery and several deferrals. Treat that document as historical evidence, not acceptance criteria under the new standards.

The open children have native blocking edges: #34 waits for #33, #35 waits for #34, and #36/#37 each wait for #35. They describe feature dependencies; any new implementation tickets must also satisfy the current one-layer rule. DESIGN.md currently documents simulated Preview models, so it does not by itself authorize a redesigned live-discovery or checked-Save interaction.

## Accepted decisions

- [x] **D1 — Delivery sequence.** User confirmed ADR 0012: Web Request create/read first, checked edits afterward, then OpenAI checks and deletion. Keep live discovery deferred. Existing DESIGN.md/components and ADR 0012 supply the design/behavior contract; the user subsequently removed the separate OpenDesign handoff gate and authorized proceeding.
- [x] **D2 — PR packaging.** User confirmed single-layer replacement PRs. Keep #38 available until replacements are ready. Start from current main and extract selected code; do not merge all of #38 or cherry-pick its cross-layer commits wholesale. Separate commits in one cross-layer PR would not satisfy this decision.
- [x] **D3 — Database history.** User confirmed only disposable databases exist and resets are acceptable. Use fresh schema migrations for the new Save path; no production-data conversion or migration-compatibility framework is needed. Reset only the identified project development/test database when needed; no reset has been performed.
- [x] **D4 — OpenDesign removed.** User explicitly said they no longer use OpenDesign and to skip its handoff. This session instruction supersedes the external-handoff/acceptance prerequisite in AGENTS.md, #33, and the earlier plan. Preserve the existing design system and ADR 0012 behavior; no external design artefact or additional approval round is required to start.

### Behavior to preserve in replacements

- Draft edits stay in memory until Save; Cancel before submission writes nothing.
- Save stages an immutable proposal and encrypted candidate Credential, returns an attempt handle, and visibly progresses through queued/running/finished. Only a successful worker check commits active data atomically.
- Web Request uses worker HEAD, optional Bearer Credential, and a **Reachable** finding. OpenAI later uses a manually supplied real model ID and a valid minimal-completion response; that finding does not enable a model for a Run.
- Failure retains the draft and previous active configuration. Claim fencing and per-request identities reject stale/duplicate completions. Only the worker decrypts Credentials or calls providers.
- Legacy browser data is cleared through the explicit notice/reset action in the accepted UI. Permission to reset disposable development databases does not replace this product requirement.
- Live catalogs, discovery endpoints/jobs, persisted model selections, Azure/OpenAI Compatible checks, Runs, RustFS, and production deployment remain outside these replacements. The existing model preview stays visibly simulated.

## Inspection completed — 2026-10-16

- [x] Read applicable standards and ADRs; inspect PR metadata, issue hierarchy, review threads, and Git objects without checking out the PR.
- [x] Link PR #38 to this T3 thread.
- [x] Pin inspected refs: main `e5dd58b77a6b917ada535a6e79bb7ccc69ea6e1a`; PR head `500256913e7f9fdd7bbe6a6e3ad41f6d93e46285`; merge base `ed40b825b988c3c88eddf7b2690e446407caafe4`.
- [x] Confirm divergence: main has 42 commits after the merge base; PR has 10, touching 36 files. GitHub reports conflicting. Review threads have no unresolved entries; old approvals/checks do not validate a future merged tree.
- [x] Obtain 12 conflict paths with `git merge-tree`, without changing the working tree/index.
- [x] Preserve existing untracked `pr40-review-comments.json`.

### Current-main validation

| Check | Observed result |
| --- | --- |
| `go build ./...`, `go vet ./...` | Passed as the first two `make check` steps. |
| `make check` | Passed on main after installing CI-pinned golangci-lint v2.14.0 and normalizing local Go checkout line endings. No Go source diff or weakened settings. |
| `pnpm check` | Passed with process-local `API_URL=http://127.0.0.1:8080`: 0 Svelte errors/warnings. Initial run without API_URL failed configuration loading. Sync also prints existing alias/path configuration diagnostics. |
| `pnpm test:unit` | Passed: 34 tests. |
| `pnpm knip` | Passed with process-local API_URL. Initial run without it failed to load Vite; its apparent unused/unresolved findings were not a valid baseline. Existing alias deprecation diagnostics remain. |
| Replacement branches | Not created or checked: exact new type/lint/test failures remain unknown. |

The root gate currently uses strict `checkJs` through `svelte-check`, `knip`, and Go lint/security checks. There is no root ESLint configuration/script; preserve actual gates rather than introducing a new lint stack for this recovery.

### Concrete repair and simplification inventory

These findings concern the pinned PR head. Apply them only when a replacement actually reuses that code. Discovery-only repairs remain deferred with discovery rather than becoming a parallel cleanup project.

| Priority / layer | Finding and planned evidence |
| --- | --- |
| Required when reused — provider | `internal/provider/verify.go:138–156` ignores body-read errors and accepts empty, HTML, or invalid JSON 2xx bodies as verified. Before reusing the OpenAI checker for #36, replace the empty-200 success expectation with a meaningful failing response-shape test. Enforce read errors, explicit body caps, and parsed URL construction for retained calls. Web Request HEAD intentionally proves only 2xx reachability and does not require a completion body. |
| Required — worker/jobs | `internal/worker/runner.go:45–54` returns on cancellation without releasing the active claim. Add a failing shutdown test and fenced release behavior; cover competing workers, stale completions, and bounded reclaim. No worker tests exist at the inspected head. |
| Required when reused — frontend | `discovery-client.js:91,117` parses successful responses without guarding JSON/shape; polling failures lose API-unavailable classification and timeout aborts can escape raw. Reuse only a small, corrected Save-attempt polling contract with payload, queued/running/finished, malformed JSON, outage, timeout, and cancellation tests. |
| Deferred — discovery/model state | The result mapper accepts unchecked state/source/blank IDs; optimistic model enablement can survive reload without completed verification. Keep this code off replacement branches; address it when live discovery is scoped later. |
| Required — accepted scope | Browser provider checks and plaintext Credential localStorage remain in #38. Resolve the worker-backed slice's obligations explicitly; a successful discovery call does not make these deferrals compliant. |
| Required — API | `internal/api/server.go` accepts `connectorId` without persisting it. Either give it a real contract or remove it with every caller; do not keep an ignored field for future compatibility. |
| Candidate — composition | Reuse main's config/proxy/startup ownership instead of retaining replaced PR `fatal`/`must*` helpers or duplicate dotenv plumbing. |
| Deferred — discovery frontend | Internal-only `verifyModelById` export, redundant verification-disabled checks, and duplicated stale/abandonment paths are candidates for later discovery cleanup; do not port them just to simplify them. |
| Candidate — provider/jobs | Inspect always-nil provider error returns, the unused loaded `SafeMessage` field versus result JSON, and a getter wrapping one claim-attempt constant. Remove surface area only after checking callers and failure semantics. |

All database tests must use an explicitly disposable, isolated database: existing PR tests delete rows from `discovery_jobs` and skip when `TEST_DATABASE_URL` is absent.

## Execution plan

### 1. Use the existing design and prepare validation

- [x] **T0 — Design source settled by user instruction.** Use existing DESIGN.md/components plus ADR 0012 for Save / Cancel, Credential label/unchanged replacement, queued/running/finished/failure, API-unreachable, unavailable providers, explicit legacy reset, and existing responsive/focus/motion behavior. The user removed the external OpenDesign handoff and its approval gate. #33 has not been changed or closed on GitHub.
- [x] **T1 — Validation baseline.** Installed/verified golangci-lint v2.14.0 using the official release checksum. Main's complete make check passed with process-local API_URL and linter PATH. Go/pnpm/Playwright/scanners/OCR/Docker CLI exist. Docker engine is currently stopped; database/runtime validation waits for the relevant layer.
- [ ] Check for a newer remote main/PR head and update the pinned refs. Preserve the original PR head through a backup ref before branch edits; keep the main workspace and unrelated untracked files intact.
- [ ] Identify an isolated disposable project database and record its reset/recreate procedure without Credential values. Plan fresh Save-path migrations after the current main baseline; omit #38's old discovery migration. Remove/replace the no-op bootstrap within the schema task, using a fresh development database rather than adding missing-version bypasses.
- [ ] Prepare self-contained single-layer implementation tickets from T2–T7 below, referencing their parent feature and failure cases. No new GitHub issues or comments are created in this planning session. Skip any task/layer that inspection shows needs no change; never manufacture a PR to fill a row.

Done when main's full gate runs and the first implementation ticket has pinned behavior, layer, dependencies, test seam, and failure table. The design-source prerequisite is settled by D4.

### 2. First replacement tranche: Web Request create/read (#34)

Each row below is one layer and one PR candidate. Land prerequisites before basing the next PR on updated main. The rows are dependency tasks for one feature; #34 closes only after the complete create/read path passes acceptance. Intermediate PRs must build/test independently and keep unfinished paths unavailable to operators.

| Task / layer | Blocks on | Smallest complete change and completion evidence |
| --- | --- | --- |
| T2 — provider client | T0, T1 | Extract the necessary hardened HTTP boundary and Web Request HEAD check. Use optional Bearer only when supplied; return safe Reachable findings. Table/fixture tests cover blocked destinations, redirects, status, timeout, cancellation, and header behavior. No catalog/OpenAI/Azure code. |
| T3 — database/jobs | T0, T1 | Fresh goose schema and sqlc queries for Connectors, Credential generations with tombstones, and immutable Save attempts. Implement encrypted storage, claims, bounded reclaim, fenced completion, and atomic create/initial-generation commit. Disposable Postgres tests prove competing claims, stale results, failed candidate cleanup, encryption, and Down after rows exist. Keep crypto ownership here; the API encrypts on creation and never decrypts. |
| T4 — worker | T2, T3 | Consume Save attempts, decrypt only inside the worker, execute HEAD, and commit only the active successful claim. Bound total work below reclaim; cancel/release on shutdown. Test success, failure, timeout, crash/reclaim, duplicate completion, and shutdown through the worker boundary. Include required entrypoint/build glue, such as copying internal source when cmd first imports it, so existing Docker builds keep working. Record any trivial-glue test exemption. |
| T5 — API | T3, T4 | Stage create attempts, expose safe attempt state, and list saved metadata. Validate names, URLs and credential-shaped query parameters; require labels for supplied Credentials. Reject unsupported providers. API tests assert no active record on failure and no secrets, fingerprints, provider bodies, or outbound calls. Preserve main's listener, healthcheck, config, and shutdown ownership. |
| T6 — dev orchestration | T4, T5 | Wire the worker service/startup/watch into main's Compose flow; required source-build inputs accompany the first code imports that need them. Preserve same-origin API_URL proxying, loopback bindings, health/dependency order, pinned images, and direct Make recipes. Verify a fresh stack starts, migrates, becomes healthy, and shuts down. No production packaging changes. |
| T7 — frontend store and callers | T0, T5, T6 | Implement typed Save-attempt requests, list reads, polling, abort/deadline/error mapping, per-request stale protection, and draft retention. Migrate the Svelte callers in the same PR to the accepted Save / Cancel design; show queued/running/finished/Reachable findings and keep unsupported providers unavailable. Retire direct provider calls and Credential localStorage loading/writes; deliver the explicit reset notice/action and simulated preview labels. Unit tests assert payloads, shapes, failures, stale results and reset; Playwright proves draft retention, reload, API-unreachable, keyboard/focus, and 375px/1280px screenshots. No live discovery code. |

- [ ] Deliver T2–T7 through their single-layer tickets and PRs, checking off their own detailed criteria as they land. Keep frontend components with their store-contract migration instead of landing an unused store or weakening Knip to stage it.
- [ ] Verify #34 end to end with a local HTTP fixture and disposable Postgres: HEAD, optional Bearer, success, failed create, timeout, late completion, encrypted persistence, safe findings, and reload.

Done when #34 acceptance passes on the integrated main and every replacement has current check/review evidence. This is the first feature completion checkpoint; do not pull #35–37 behavior into this tranche.

### T2 implementation ticket — Web Request provider check

**Parent:** #34. **Layer:** provider client only. **Blocked by:** none (T0/T1 settled). **Status:** implemented and locally verified; draft [PR #44](https://github.com/BasuruK/goldfin/pull/44), CI pending, not merged. Branch `feature/basuruk/34-web-request-provider-check`, based on main e5dd58b. Implementation commits: `2b8244b`, `a6e2d7a`.

**Confirmed test seam:** the provider HTTP interface already selected in the plan: local HTTP fixtures observe HEAD, optional Bearer, request identity, status and cancellation; hardened-client tests exercise redirect/address policy. The address predicate has a table-driven test as required by CODING_STANDARDS.md.

- [x] Supply one reusable hardened HTTP client: no environment proxy, validate all resolved destination addresses, connect to the validated address rather than resolving again, same-origin redirects only with a finite hop limit, and a bounded request deadline. Preserve HEAD's HTTP(S) contract and keep DNS/address restrictions enforced for both schemes.
- [x] A Web Request check sends HEAD to the configured URL/path/query, adds Authorization: Bearer only for a supplied Credential, closes its response, and returns a Reachable finding only for 2xx. HEAD requires no response body; no catalog/body-parsing infrastructure added.
- [x] The finding carries only bounded HTTP status and elapsed time plus the proven depth. Error strings contain no Credential, raw URL, provider body, or raw transport exception. Cancellation/deadline remain distinguishable.
- [x] Tests cover successful/failed status, optional auth, malformed URL/headers, blocked destinations, redirect changes/loops, deadline/cancellation, and safe errors. Observed red/green slices for missing checker, absent-Credential header, failed status, unsafe errors, missing deadline, missing client/address predicate, and missing redirect/special-address protections. A further regression test exposed the detached dial budget and went red/green. Eleven provider tests pass, including concurrent isolation; race detector and full make check pass after the review fix.
- [x] No database, job runner, API, UI, discovery, or OpenAI implementation in this replacement. No new dependency added.
- [x] Pass make check, self-review, code-review and OCR delegation review; record evidence and commit the replacement separately. No UI screenshots/browser checks apply to this provider-only diff; no live provider calls or database migration tests are claimed.

#### Standards

No findings in the independent Standards review of `e5dd58b...2b8244b`. All five changed files were reviewed; the bodyless HEAD finding follows ADR 0012. No actionable code smells reported.

#### Spec

No findings in the independent Spec review of `e5dd58b...2b8244b`. T2's HEAD/auth, safe findings, timeouts, cancellation, destinations, redirects, and resource ownership match the scoped ticket. No later-layer completion claimed.

#### OCR delegation review

OCR v1.13.0 selected `check.go` and `client.go`; host reviewed both against its resolved Go rules. Coverage: 2 reviewable files, 2 reviewed, 0 skipped (100%); TASKS.md was excluded as unsupported extension and both test files by the default path filter. The independent axes reviewed those excluded files too.

One valid medium-severity finding: `client.go` custom DNS lookup/address loop inherited Transport's detached dial context; individual socket timeouts did not bound the whole dial path. Verified against installed Go transport source. Added `TestDialPublicBoundsDetachedConnectionWork`, observed it fail, then added one shared dial deadline in `a6e2d7a`; the socket-control fixture stops before any external connection. Rechecked both production files after the fix. No unresolved findings, rejected findings, or trivial-glue test exemptions.

Review totals: Standards 0; Spec 0; OCR 1 resolved. Final full make check and provider race test passed after the fix. Existing Svelte alias/path sync diagnostics and zizmor offline-mode notice are unchanged from main.

| Failure | Required provider-client behavior / evidence |
| --- | --- |
| Two writers | Concurrent checks keep Credentials/findings isolated; the shared client has no mutable per-Connector state. HTTP fixtures assert independent requests. |
| Mid-flight crash | No persistence in this layer and no raw secret/body result. Queue reclaim belongs to the worker/storage tickets. |
| Mid-flight shutdown | Cancelling the supplied context interrupts HEAD promptly and yields cancellation, without a success finding. |
| Timeout | The whole request, including redirects, is bounded; a deadline yields timeout and no Reachable finding. |
| Stale reclaim/result | This function returns evidence only; it writes no active state. Claim-token fencing remains a required consumer obligation in T3/T4. |
| Rollback after data exists | Failed HEAD returns no successful finding and changes no data; the later Save transaction owns rollback. |

### 3. Later feature sequence

- [ ] **#35 after #34:** plan separate changed layers for checked edits and Credential replacement, then implement through the same gates. Tests must prove unchanged Credential reuse, required replacement label, immutable generations, atomic replacement, stale/duplicate rejection, and failure retaining old active data plus the draft.
- [ ] **#36 after #35:** plan separate changed layers for OpenAI manual-ID saves. Its provider-client ticket must first demonstrate invalid/empty/HTML 2xx responses fail, then implement the current official minimal-completion contract. Record exact checked model identity as evidence, without creating a catalog or enabling models. Keep Web Request findings distinct.
- [ ] **#37 after #35:** plan separate changed layers for deletion, tombstones, pending-candidate cleanup, and races with late Save completions. Preserve generation IDs/labels while clearing unreferenced encrypted values. Do not add a fictional Run schema.
- [ ] **Discovery later under #31:** re-scope against the completed Save foundations and a live-discovery design handoff. Only then evaluate the remaining catalog, model-state, polling, and verification code from #38. Keep the deferred defect/simplification inventory as input.

No automatic parallel implementation or extra infrastructure is required. Where later features need the same layer, complete one feature seam before starting the next; remove empty steps rather than generating ceremonial PRs.

### Historical conflict map and extraction rules

The 12 conflicts explain why a whole-branch merge is unsuitable for the chosen plan. They are inspection evidence, not an instruction to resolve #38 in place. Fresh replacement branches preserve main's current files and import only the required code.

| Conflict path(s) | Resolution intent |
| --- | --- |
| `.env.example`, `vite.config.js` | Preserve main's full-origin `API_URL` frontend proxy contract and `API_ADDR` listener separation; reconcile only required worker variables. |
| `cmd/goldfin/main.go` | Preserve current startup validation, listener ownership, healthcheck command/routes, and shutdown; add only approved worker/API behavior. |
| `docker-compose.yml` | Keep main's service health, migrations, watch configuration, and dependency order; wire retained worker behavior through the existing orchestration. |
| `go.mod`, `go.sum` | Preserve current main's dependency/security fixes; resolve required dependencies with Go tools rather than choosing one side of go.sum. |
| `ModelPanel.svelte`, `models.js`, `store.svelte.js` | Keep main's strict types, canonical provider defaults, and simulated preview; adapt only accepted Save behavior in its designated layer. |
| `model-preview.js` (modify/delete) | Retain main's simulated preview for the Save slices. #38's deletion is discovery-only and remains deferred. |
| `tests/connector-polish.spec.js`, `tests/integrations.spec.js` | Combine retained behavior coverage with main's typed mocks and UI expectations; assert request payloads. |

- [ ] Preserve one migration embed owner: keep main's `db/migrations/migrations.go`; do not import PR `embed.go`, which also declares `migrations.FS`.
- [ ] Keep current main as the composition/config/dependency baseline. Port useful function-level code and tests with their intent, rather than old orchestration files.
- [ ] Omit old `discovery_jobs` schema and discovery endpoints. Their migration `20261012120000` predates main bootstrap `20261013120000`; clean Save-path migrations avoid importing that history problem. Exercise fresh setup and rollback on disposable databases.
- [ ] Classify new compiler/type/lint/test failures per replacement before simplifying code. Exact diagnostic counts are determined when each replacement exists.

Done when retained code has one owner and the replacement contains no unused discovery infrastructure or reverted main fixes.

### 4. Repair and simplify within each replacement

These are inspection targets, not permission to rewrite every layer. Create one-layer tasks for retained work and sequence their contract dependencies.

- [ ] **Provider client:** retain one hardened outbound HTTP client, bounded redirects/body sizes/time budgets, explicit response-shape checks, and table-tested address blocking. Audit duplicate URL/status/error handling and speculative provider branches against the accepted scope.
- [ ] **Jobs/database:** retain claim-token fencing, exactly-one-row completion checks, bounded reclaims, cancellation/release, and Credential cleanup. Use required sqlc queries for the Save schema rather than carrying #38's raw-pgx deferral into replacements.
- [ ] **API/composition:** keep API handlers free of outbound calls and Credential decryption. Persist or reject accepted fields; keep startup config and resource ownership explicit.
- [ ] **Frontend async/store:** use per-request tokens, timeout/abort handling, guarded response parsing, mapped errors, reactive state, rollback, and stale-result rejection. Retire Credential localStorage persistence with the worker-backed Save path and migrate every affected caller in the same diff.
- [ ] **UI:** preserve the existing approved design. Require a new handoff for changed interactions; do not improvise a new Save/discovery design during conflict cleanup.
- [ ] Fix type/lint errors at their declarations/callers, using actual diagnostics. Migrate tests, fixtures, exports, and all callers. Keep `strict`, `checkJs`, and lint rules intact.
- [ ] Remove dead aliases/helpers, duplicate constants, redundant wrappers, fallback chains hiding invalid inputs, and speculative options only when callers and tests show they are unnecessary. Preserve security, error handling, accessibility, and observable behavior.
- [ ] For every new/fixed behavior, first observe a failing behavioral test at the existing seam, then implement the smallest fix. Record trivial-glue exemptions for the PR description.
- [ ] After each fix, search both Go/JS sides of its contract, its package, and sibling functions for the same defect. Fix valid in-seam matches; record outside-seam findings separately.

Done when each retained layer meets its contract and standards, checks pass, all callers use the final API, and each deletion has evidence.

### 5. Verify, review, and prepare handoff

- [ ] Run focused behavioral tests, then full `make check`. Fix all branch failures without weakening config or excluding new files. Distinguish missing tools/services from passing checks.
- [ ] Exercise database integration tests against an isolated database; record counts and skips. Ensure required tests actually run rather than passing solely because `TEST_DATABASE_URL` is absent.
- [ ] Verify migrations on an empty database, repeat startup on the current schema with populated rows, and exercise Down after rows exist. Use disposable databases for reset/rollback; historic #38-data conversion is excluded by D3.
- [ ] Build/start retained API/worker services with current Compose orchestration and verify their real health/readiness and shutdown behavior.
- [ ] Run Playwright coverage and capture Connector UI screenshots at 375px and 1280px; compare with DESIGN.md. Exercise keyboard/focus, themes, reduced motion, errors, polling, and rollback where affected.
- [ ] For live layout iteration, use `pnpm dev` and `/impeccable live` per AGENTS.md; remove injected layout markers afterward.
- [ ] Self-review against CODING_STANDARDS.md, then run `/code-review` against the pinned base and agreed behavior, followed by `/open-code-review-delegate` with complete file coverage.
- [ ] Verify findings against docs and checks. Commit valid in-seam review fixes touching only flagged lines; give a one-line reason for rejected findings. If a finding recurs, simplify or ask before further patching. Rerun checks affected by each fix.
- [ ] Prepare each PR title/body with its feature/layer, behavior evidence, test results, failure-table coverage, and any glue exemption. Link every created PR to this T3 thread. Recheck mergeability and CI after final changes; old green statuses are insufficient.
- [ ] Keep #38 available while replacements are prepared and preserve its source ref for later discovery. Record landed replacements and deferred work before its eventual disposition; no closure or metadata update is performed during planning.
- [ ] Update this ledger with final refs, commits, results, and unresolved outside-seam work. User authorized implementation after planning; preserve #38 and deliver only the selected replacement layer at a time.

Done when the selected PR structure is reviewable, all required checks and reviews are satisfied, and remaining work is explicit.

## Failure table

Apply these expectations to Web Request HEAD and later OpenAI completion checks, each Save-attempt transition, each migration, and frontend Save/poll/read/reset paths. Each single-layer ticket must end with its concrete failure table and test cases. This matrix is the planning contract, not evidence those tests have passed. Live-discovery tests remain deferred.

| Failure | Outbound calls | Job claims / API | Frontend async | Migrations |
| --- | --- | --- | --- | --- |
| Two writers | Each call belongs to its active claim; one hardened client contract. | Concurrent workers cannot complete the same claim; completion requires active token and one affected row. Later edits fence stale proposals from overwriting newer active data. | Superseded requests cannot overwrite the current draft or active list; a repeated legacy reset is safe. | Migration locking/version history prevents concurrent partial application. |
| Mid-flight crash | Bounded call and no Credential exposure. | Stale claims can be reclaimed within bounded attempts; late completion cannot win; active data and candidate cleanup remain consistent. | Reload reads committed active data and never restores a transient Save as success. Legacy reset can be resumed safely after interruption. | Transaction/history leave a recoverable state; test interruption where supported. |
| Mid-flight shutdown | Context cancellation stops in-flight HTTP. | Worker releases owned claims for re-run; pool/listener have one closer. | Disposed UI aborts work and ignores later callbacks. | Shutdown leaves schema and goose history consistent. |
| Timeout | Total job budget stays below stale-reclaim window, including redirects. | Terminal timeout is distinguishable; no endless polling/reclaim or late commit. | Request and overall polling deadlines map to timeout rather than reachability failure; retain draft and clear busy state. | Lock/statement timeout leaves a retryable, consistent schema. |
| Stale reclaim/result | Old worker response cannot persist under a replacement token. | Fenced finish/release handles zero affected rows explicitly; later delete invalidates pending edits. | Draft changes, a new attempt, disposal, and later deletion invalidate old UI replies; terminal server outcomes remain authoritative. | Current schema/history and version checks remain consistent after a development reset and repeated startup. |
| Rollback after data exists | Failed checks cannot commit an active Connector or replacement Credential. | Failed create adds no active record; later failed edit preserves old active data and cleans candidate values atomically. | Failed Save retains draft and active list; failure after explicit legacy reset reports safely without restoring plaintext Credentials; successful retry clears old errors. | Down succeeds against Up-produced rows; reset disposable databases only, without a historic discovery-data migration framework. |

## Decision and execution log

- 2026-10-16: Initial read-only inspection and baseline checks; wrote the draft on main. No PR checkout, merge, implementation edits, commit, push, migration/database changes, or GitHub issue/comment writes.
- 2026-10-16: User accepted the newer checked-Save sequence, single-layer replacement PRs, and disposable-database resets. Finalized the extraction plan and first replacement tranche. Design acceptance and implementation remain future tasks; no further scope decision is needed to preserve this plan.
- 2026-10-16: User authorized proceeding and removed the OpenDesign handoff requirement. Installed release golangci-lint v2.14.0 into the per-user goldfin-tools cache after SHA-256 verification. Started full main validation; initial lint reports formatting on three existing Go files, under investigation before replacement work. Docker client exists but the local Docker engine is not running; no database reset has occurred.
- 2026-10-16: Main's full gate passed after local-only Go LF normalization (Git source unchanged). Preserved #38 at backup/pr38-before-replacements-20261016; started the T2 branch from e5dd58b. Implemented only the provider-client seam through red/green slices. Ten provider tests, race detector, focused lint, and full make check passed. Checked special-address policy against IANA's [IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/) and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/) registries; policy remains conservative for transition/reserved ranges. Review evidence follows after formal review.
- 2026-10-16: Completed independent Standards/Spec review (0 findings each) and host OCR review (2/2 production files; dial-budget finding fixed in a separate regression-tested commit). Final 11-test provider suite, race detector, and full make check passed after the fix. Published draft replacement PR #44 and linked it to this T3 thread. No #38 changes, main merge, database reset, or later-layer implementation performed. Next replacement is T3 storage/jobs; it remains separate from this PR.
