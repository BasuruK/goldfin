# v1 runs one Document through a Workflow and shows what it extracted; scoring comes later

v1 is the shape in `prototypes/ocr only workflow/ocr-playground.html`. The operator saves Connectors and Prompts,
wires them into a **Workflow**, runs it over **one Document**, and reads the output. There is no Ground truth, Field,
Match, Verdict, Coverage, Judge or Comparison in v1, and nothing about an execution is kept. A **Dataset** arrives in
v2. Scoring returns after v2, unscheduled.

The prototype is the UI and request specification for v1: its screens, its provider request and response shapes
(`extractOCR`, `invokeLLM`), and the behaviour pinned by `ocr-playground.test.js`. This ADR records the decisions the
prototype does not make, or makes differently.

## Decisions

- **A Workflow is any directed acyclic graph** of nodes. A node is a saved Connector, plus a Prompt for an LLM node.
  Cycles are refused. The prototype still executes only one linear path (OCR → LLM → … → Preview, one input per
  node), so building the graph executor is v1 work, not something already done.
- **Connector kinds in v1**: OCR (Azure Document Intelligence `prebuilt-read`, Mistral OCR on Foundry), LLM (OpenAI
  Responses, OpenAI-compatible Chat Completions), and the generic **REST connector** (method, URL, headers, body
  template with `{{credential}}`, response path). A REST node takes the Document, as an OCR node does, unless its
  definition says otherwise.
- **One Document per execution.** Many Documents is the v2 Dataset.
- **Prompt versions, no execution history.** Saving a Prompt appends an immutable Prompt version. An execution's
  output is shown and then discarded; it is a Probe, not a Run.
- **Show what came back.** An LLM reply that stopped early (`status: incomplete`, `finish_reason != stop`) is shown
  as extracted, labelled with how it stopped. This reverses the first case of the prototype test *LLM failures never
  preview partial output*. Transport and HTTP failures still show an error and no output.
- **No rescue** ([ADR 0003](0003-goldfin-does-not-rescue-the-model.md) holds for Probes): no output schema, no format
  reminder, no retry of a malformed or cut-off answer.

## Deferred

| Deferred | Until |
|---|---|
| Scoring: [0002](0002-declare-formats-never-infer.md), [0004](0004-a-blank-cell-is-an-assertion.md), [0006](0006-judge-contract.md), [0007](0007-validity-is-structural-and-advisory.md), Coverage, Attribution | Scoring work starts, after v2. |
| Runs and Connector snapshots, [0008](0008-a-re-attempt-is-a-new-run.md) | An execution is stored (v2 Dataset Runs). |
| Dataset, Dataset version, Document storage (RustFS) | v2. |

## Consequences

- **No v1 one-way door touches results.** Nothing is stored about an execution, so there is no snapshot and no frozen
  record to protect yet. The one-way doors are Credentials ([ADR 0013](0013-walking-skeleton-synchronous-saves.md))
  and immutable Prompt versions.
- **A Probe is synchronous but slow.** A Document Intelligence poll can take minutes (the prototype allows 5), so the
  Probe route needs its own timeout above the API's 30 s write timeout and 5 s handler budget. It still needs no
  worker: one operator waits on one request ([ADR 0013](0013-walking-skeleton-synchronous-saves.md)).
- **Outbound calls move from the browser to the `api`.** The prototype keeps keys in `localStorage` and calls
  providers from the page. v1 stores Credentials encrypted and makes every call server-side.
- **The golden test becomes an extraction test**: one real Document and recorded provider responses, run through an
  OCR → LLM Workflow, produce a known displayed output, and the outbound requests carry the prompt verbatim with no
  output schema.
