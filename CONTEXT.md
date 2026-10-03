# Goldfin

Goldfin evaluates a financial organization's system prompt for document field extraction. It runs a pipeline — OCR, then LLM extraction — over a customer-built dataset and produces scores that say which stage lost the value.

## Language

### What gets measured

**Pipeline**:
The full OCR-then-LLM path a document travels through. The unit Goldfin scores.
_Avoid_: Flow, Chain, Pipeline run

**Stage**:
One step of the pipeline, executed on its own as well as in sequence. Goldfin runs stages individually so a failure can be attributed rather than guessed at. A **fused gateway** collapses both Stages into one Connector's single call; the Stages still exist as the thing being measured, but only one of them can be re-run alone, which is why attribution there is partial rather than absent.
_Avoid_: Step, Phase, Stage result

**State**:
Where a Document sits in the Pipeline. Five of them: `pending` (not reached — also where a Run resumes), `running`, `scored`, `failed` (terminal, and records which Stage and why), `cancelled` (aborted by a user at a checkpoint). There is no `skipped` state — a document the Run never reached is `pending`, and a second word for the same thing is how a state machine grows a state nobody can explain.
_Avoid_: Status, Phase, Step, Outcome

**Extraction**:
The structured values a Stage pulls out of a document, matched against ground truth. Whatever the prompt made the model produce — Goldfin sends no output schema, so malformed output is a real, reportable result rather than something to be prevented. It may also carry keys the Manifest never declared; those are kept as evidence of the prompt, not scored.
_Avoid_: Prediction, Result, Output, OCR result

**Attribution**:
Naming the Stage responsible for a value. The reason Goldfin can run a Stage alone. Only what was **measured** may be attributed: a Document that died, and the Stage it died at; a `missing` value, which is the extraction Stage's on evidence, since the OCR Stage returned text and the extraction did not. A `wrong` value is **not** attributed by a pipeline Run — the run cannot tell whether OCR misread a digit or the extraction read what OCR gave it — and gets an owner only when a single-stage re-run measures one. A **fused gateway** that runs both Stages in one call keeps the `missing` attribution, because the response carries both halves; it loses the `wrong` one **permanently**, because no separable Stage exists to re-run and a Goldfin-side model would measure the grader rather than the customer's prompt. A Run that cannot say which Stage lost a value **says so in words** — an unattributable score is shaped exactly like an attributable one until someone must defend it.
_Avoid_: Debugging, Diagnosis, Root cause analysis

**Field**:
A single named value a Dataset version expects from each Document, with a declared type, a Normalization chain, and a Comparator. **`required`** is annotation-side and two-state: `true` is a promise that every Document has a value, and a blank cell under it is a self-contradicting Manifest that fails at ingest; `false` is the customer saying absence is intended on some Documents, and those blank cells are scored rather than skipped.
_Avoid_: Attribute, Column, Property, Key — _key_ is reserved for Connector credentials

**Field group**:
A named set of Fields that together answer one question, such as a beneficiary address split across line, city, postcode and country. Grouping changes presentation only: every member is an ordinary Field with its own Verdict, and the group's score is derived from those, never stored. It is the only source of a `partial` in the deterministic path.
_Avoid_: Composite Field, Nested Field, Sub-value

**Comparator**:
What decides a Match: deterministic — normalize both sides, then compare — or Judge, for an answer that is not string-comparable. Chosen per Field, so a single Dataset can carry both.
_Avoid_: Scorer, Strategy, Mode, Matcher

**Manifest**:
The Ground truth a customer supplies when ingesting a Dataset, before Goldfin owns a copy. One artifact: it declares the Fields and carries their values at once.
_Avoid_: Sidecar, Import file, CSV

**Ground truth**:
The value a Field is expected to hold, supplied by the customer. Goldfin never infers it. A Manifest is where it arrives; a parsed copy inside a Dataset version is what a Run reads. **A blank cell is part of the claim, not a gap in it**: it asserts that the Document carries no such value, and it is scored like any other, so Goldfin never has to guess what an annotator meant or how far they got.
_Avoid_: Expected value, Label, Answer, Correct output

**Normalization**:
The ordered chain of named rules that makes two representations of the same value comparable before matching, such as a date format or a currency symbol. The catalog is closed and ships with Goldfin; a Field names a chain, never code. Where a format is ambiguous, it is declared, never inferred. Deterministic scoring cannot exist without it.
_Avoid_: Canonicalization, Cleaning, Formatting, Normalizer

**Match**:
The verdict that a normalized Extraction equals its Ground truth. Five outcomes, and the fact that failure has three distinct shapes is the point: `match`, `partial`, `missing` (the Pipeline ran and the Stage returned no value), `unparseable` (an Extraction the type did not accept), `wrong` (a well-formed Extraction of a different value). The three ways of failing are never indistinguishable to the user, but they do not score differently — a score is always matched over Coverage. A Document that never produced an Extraction writes **no Match at all**: absence at the document level is not absence at the field level, and the two are reconciled on a document-level line rather than by inventing rows. The Field's declared **type** is the only arbiter of what counts as a value *against a Ground truth that exists*: an absent key or an explicit `null` is `missing` before the type is consulted, while `""` is a value handed to Normalization, where `text` accepts it and a typed Field rejects it as `unparseable`. Against an **absent** Ground truth the type is not consulted at all, because there is nothing to normalize toward: an absent Extraction is a `match`, so a prompt that correctly declines to invent is rewarded, and anything the model emits is a `wrong` — with the single exception of `""` on a `text` Field, which says the same thing absence does. Every Match against an absent Ground truth carries a **`ground_truth_absent`** condition, which is how the UI separates a fabrication from a misread without inventing a sixth reason. `unparseable` is terminal — the Judge never rescues a value that will not normalize, and a malformed or truncated answer is not retried, because a Run scores one attempt at the customer's deployment, not Goldfin's best of two.
_Avoid_: Correct, Pass, Diff

**Verdict**:
The persisted record of one Match: both raw values, both normalized values, the resolved chain, the reason, the comparator, and the Goldfin version that scored it. A reason may carry **conditions** — `ground_truth_absent`, when the Manifest asserted the Document had no such value; `judge_unsure`, when the Judge abstained rather than decide; `invalid`, when the value failed a Validity check — so a miss never becomes indistinguishable from another miss, and **failure never invents a new outcome**. Frozen when the Run executes, so a score cannot change after it has been shown; rescoring is a new Run over a new Dataset version.
_Avoid_: Result, Score, Evidence

**Validity**:
Whether a value is a **legal instance of its declared type** — an IBAN passing mod-97, a card number passing Luhn, a currency code in ISO 4217. A check rides the type rather than the Field, ships closed, and **never references Ground truth**: a date in the future is not a validity problem, it is a `wrong` like any other. Checks are structural, never time-dependent, so a Verdict stays true forever. Always **advisory**: a failure records an `invalid` condition and leaves the score alone, because the condition adds severity, not correctness. Runs on the normalized value, so a fault in Goldfin's own chain is never recorded as a model failure.
_Avoid_: Validation, Check, Constraint, Rule — *rule* is reserved for Normalization

**Coverage**:
The count of Documents a score was actually computed over, carried with the score itself. A Field score reads "47 of 50", never a percentage with a hidden denominator, because Runs with different Coverage are not comparable. The denominator is fixed at the Dataset version's Document count: a Document the Run never reached counts as a miss, exactly as a Document that ran and yielded nothing does. A Document that produced no Extraction therefore sits in that denominator and matches nothing, so **the count alone never says how many Documents actually ran** — that is carried on a document-level line, and a Comparison shows it on both sides. A Run that ended early — cancelled, or stopped on the token cap — is **flagged incomplete**, because a stopped Run and a clean one otherwise produce identically shaped scores.
_Avoid_: Sample size, Denominator, Completeness

**Judge**:
The LLM that validates a non-string-comparable answer. An escape hatch, never the primary scorer, and never consulted unless the Field's `scoring` says `judge`. It returns `match`, `wrong`, or `unsure` with a persisted rationale — **no number of any kind**, and a self-reported confidence is worse than none because it is uncalibrated. An `unsure` scores as a `wrong` carrying a `judge_unsure` condition: the value was never confirmed, and the condition says so. Goldfin ships the Judge's prompt, versioned and uneditable, because the Judge grades the customer's prompt and the grader must not belong to the graded. The Judge is final within a Run; a user who does not believe it re-runs against a new Dataset version with `scoring: deterministic`.
_Avoid_: Validator, Reviewer, Grader

### The objects a user makes

**Document**:
One file a Dataset version holds, carrying the source bytes the Pipeline runs over. Goldfin owns those bytes — they are copied in at ingest, never referenced where they happen to sit. The unit a Run iterates and the denominator of Coverage.
_Avoid_: File, Page, Item, Record

**Dataset**:
A named container of Dataset versions, holding the Documents with their Ground truth and declaring the Fields to be scored.
_Avoid_: Test set, Corpus, Benchmark, Fixture

**Dataset version**:
One immutable revision of a Dataset — its Documents, Fields and Ground truth together. A Run points at a version, never at a mutable Dataset, exactly as it points at a Prompt version. A version stays editable until a Run references it.
_Avoid_: Snapshot, Revision, Iteration, Dataset v2

**Prompt**:
The system prompt being evaluated. Versions are immutable; a new version is a new thing.
_Avoid_: Template, System message, Instruction

**Prompt version**:
One immutable revision of a Prompt. Runs point at a version, never at a mutable Prompt.
_Avoid_: Revision, Version, Iteration

**Run**:
One execution of the Pipeline over one Dataset using one Prompt version and a set of Connectors. Stored and diffable, so "is v2 better than v1?" is a question Goldfin answers. A Run **copies the definition of each Connector it used**, so a later edit to that Connector cannot change what this Run meant; re-attempting a Document is a new Run, never a repair of this one.
_Avoid_: Evaluation, Test run, Experiment, Job

**Comparison**:
The diff between two Runs. A first-class question, not a report Goldfin happens to print.
_Avoid_: Diff, Delta, Regression report

### Talking to the outside

**Connector**:
A registered, reusable configuration for reaching an external service. Two types: `rest` and `llm`. Connectors are entities, not settings — created once and referenced by many Runs. They stay **editable in place**, and it is the Run that remembers: it copies the definition it used at start — method, URL, headers, body, response path, with `{{credential}}` still a placeholder — so a fix to a response path never silently changes what an earlier Run measured. A Connector may be **fused**, serving both Stages in one call; that is a supported shape, not a degraded one, and it is not detectable from the definition, so Goldfin neither flags nor refuses it.
_Avoid_: Integration, Adapter, Provider, Endpoint

**REST connector**:
A Connector that calls an arbitrary endpoint: method, URL, auth, request body, and the path to the text in the response. How a customer reaches the OCR service their internal platform team fronts.
_Avoid_: HTTP connector, Custom endpoint, Webhook

**LLM connector**:
A Connector that calls a model by base URL and API key. Carries credentials and so is handled as a secret.
_Avoid_: Model, Provider, Model config

**Credential**:
A named, versioned secret owned by one Connector. A Connector references it as `{{credential}}` in its URL, headers or body template, and the value is substituted at the last moment before the call — so it lives in exactly one place and redaction is a property of the shape. Encrypted at rest; never logged, never returned to a client (not even a last-4 — the only thing returned is when it was set), never in git. Defends the database file, backups and image layers; does **not** defend a compromised host, and says so.
_Avoid_: API key, Secret, Token — use the specific one in conversation

**Credential generation**:
One immutable revision of a Credential. Rotation appends one and marks the previous `superseded`; it never rewrites, because a Run that crashed must be able to resume on the value it started with. A Run pins the generation it began with, so a rotation never changes a Run already in flight. A generation a Run has referenced cannot be destroyed; an unreferenced one can be **tombstoned**, which keeps its label and id and drops the value, so a burned key can actually be burned. Every generation carries a required customer-supplied label.
_Avoid_: Version, Revision, Key version, Credential version

**Attestable**:
A score whose inputs are all persisted, so a Run can be reproduced exactly later. Required of every Judge verdict and every Verdict.
_Avoid_: Reproducible, Auditable, Explainable

### Words to be careful with

**Evaluation**:
_Overloaded — do not use._ Say **Run** for one execution, **Comparison** for the diff between two, and **Dataset** for the thing being scored. Reserve "evaluation" for prose about the practice, never for an entity.
_Avoid_: Use instead of Run, Comparison, or Dataset

**OCR engine**:
Fixed for a given Run. Goldfin does not choose or rank OCR engines; it calls whatever Connector the customer configured.
_Avoid_: Provider, Reader, Scanner
