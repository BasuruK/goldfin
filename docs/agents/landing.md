# Landing a change

Every change lands as one PR that holds one feature seam in one layer: the Workflow executor, storage and migrations, the API, or a frontend store. Split multi-layer work with `/split-to-prs`. The path is `/to-spec` → `/to-tickets` → `/implement`.

## 1. Classify the door

- **One-way**: the seam stores, transmits, or displays a Credential; writes Prompt versions, Run results, Verdicts, or Connector snapshots; or migrates data that already exists. The spec and each one-way ticket end with a **Failure table** holding only the rows the path can reach, from: two writers, mid-flight crash, mid-flight shutdown, timeout, stale result, rollback after data exists.
- **Two-way**: everything else, including retries, timeouts, fences, queues, workers, caches and UI async handling. Ship the synchronous, single-process version. Each mechanism you leave out becomes a `ponytail:` note naming the trigger that brings it back.

The walking-skeleton golden test (one real Document plus recorded provider responses, run through an OCR → LLM Workflow, producing a known displayed output) passes before any infrastructure seam (queue, worker, retry, fence, cache) starts. After that, each infrastructure ticket names the Run-path failure it prevents.

Done when the seam, its layer, its door, its design artefact (UI only) and its Failure table (one-way only) are written in the ticket.

## 2. Build red → green

`/implement` with `/tdd`: one failing test at the seam, watched go **red**, then the code that turns it green, one test at a time. A trivial-glue exemption goes in the PR body.

- Handle exactly the cases the Failure table lists. A further case on a two-way seam becomes a `ponytail:` note; on a one-way seam, ask first, stating the failure mode, its likelihood and its complexity cost.
- Look up module paths, config keys and flags in `node_modules`, `go doc` or Context7, and resolve versions, action SHAs and image digests with CLI commands.
- Fix a type or lint error at its declaration or call site, with strict checks left on.
- Move every caller to the new contract and delete the replaced function in the same diff.

Done when every new behaviour has a test that went red then green, and no caller uses the old contract.

## 3. Verify

- **Sweep** after a bug fix: grep both sides of the contract (Go and JS), the package, and sibling functions for the same defect, and fix every match that has the mechanism.
- **Browser**: a change with a visible effect is driven in the browser before the PR. Capture Playwright screenshots at `375px` and `1280px` and check spacing against the `DESIGN.md` tokens.
- **Gate**: `make check` is green.

## 4. Review by door

CodeRabbit (`.coderabbit.yaml`) is the only hosted reviewer; OpenCodeReview runs locally.

- **One-way**: before pushing, run each of the local trio once: a self-review against `CODING_STANDARDS.md`, `/code-review` (Spec and Standards), `/open-code-review-delegate`.
- **Two-way**: `make check`, then CodeRabbit. Reply to a finding that adds a defensive mechanism (retry, token, fence, lease, hardening) with "two-way door; deferred as a `ponytail:` trigger", unless it is labelled `bug` or `security`.
- **Both**: fix `bug` and `security` findings, and settle every other finding in one batch, either as a tracked issue or rejected with a one-line reason, in at most one fix round. Check each applied fix against the docs and `make check`, in commits that touch only the flagged lines. A finding that recurs after that round means the seam is wrong: simplify it, or ask.

## 5. The PR body

1. **Opening line**: `Closes #<n>`, the file count and `+/−`, and the reading order (which file first).
2. **Summary**: the problem, then a before/after sketch of the state or data flow in a `diff` or `text` block.
3. **Evidence**: before, then after, in the tests (their names as sentences) and in the browser (what you clicked and saw), or `No UI change`.
4. **Merge Danger**: the door, the blast radius, known limits, and what was left out of scope.
5. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

If work outside the seam remains, end your hand-off with one question: "Fix X too?"
