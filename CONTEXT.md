# Goldfin

Goldfin evaluates a financial organization's system prompt for document field extraction. It runs a pipeline — OCR, then LLM extraction — over a customer-built dataset and produces scores that say which stage lost the value.

## Language

### What gets measured

**Pipeline**:
The full OCR-then-LLM path a document travels through. The unit Goldfin scores.
_Avoid_: Flow, Chain, Pipeline run

**Stage**:
One step of the pipeline, executed on its own as well as in sequence. Goldfin runs stages individually so a failure can be attributed rather than guessed at.
_Avoid_: Step, Phase, Stage result

**Extraction**:
The structured values a Stage pulls out of a document, matched against ground truth.
_Avoid_: Prediction, Result, Output, OCR result

**Attribution**:
Naming the Stage responsible for a wrong value. The reason Goldfin can run a Stage alone.
_Avoid_: Debugging, Diagnosis, Root cause analysis

**Field**:
A single named value a Dataset version expects from each Document, with a declared type, a Normalization chain, and a Comparator.
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
The value a Field is expected to hold, supplied by the customer. Goldfin never infers it. A Manifest is where it arrives; a parsed copy inside a Dataset version is what a Run reads.
_Avoid_: Expected value, Label, Answer, Correct output

**Normalization**:
The ordered chain of named rules that makes two representations of the same value comparable before matching, such as a date format or a currency symbol. The catalog is closed and ships with Goldfin; a Field names a chain, never code. Where a format is ambiguous, it is declared, never inferred. Deterministic scoring cannot exist without it.
_Avoid_: Canonicalization, Cleaning, Formatting, Normalizer

**Match**:
The verdict that a normalized Extraction equals its Ground truth. Five outcomes, and the fact that failure has three distinct shapes is the point: `match`, `partial`, `missing` (no Extraction), `unparseable` (an Extraction the type did not accept), `wrong` (a well-formed Extraction of a different value). The three ways of failing are never indistinguishable to the user, but they do not score differently — a score is always matched over Coverage.
_Avoid_: Correct, Pass, Diff

**Verdict**:
The persisted record of one Match: both raw values, both normalized values, the resolved chain, the reason, the comparator, and the Goldfin version that scored it. Frozen when the Run executes, so a score cannot change after it has been shown; rescoring is a new Run over a new Dataset version.
_Avoid_: Result, Score, Evidence

**Coverage**:
The count of Documents a score was actually computed over, carried with the score itself. A Field score reads "47 of 50", never a percentage with a hidden denominator, because Runs with different Coverage are not comparable.
_Avoid_: Sample size, Denominator, Completeness

**Judge**:
The LLM that validates a non-string-comparable answer. An escape hatch, never the primary scorer.
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
One execution of the Pipeline over one Dataset using one Prompt version and a set of Connectors. Stored and diffable, so "is v2 better than v1?" is a question Goldfin answers.
_Avoid_: Evaluation, Test run, Experiment, Job

**Comparison**:
The diff between two Runs. A first-class question, not a report Goldfin happens to print.
_Avoid_: Diff, Delta, Regression report

### Talking to the outside

**Connector**:
A registered, reusable configuration for reaching an external service. Two types: `rest` and `llm`. Connectors are entities, not settings — created once and referenced by many Runs.
_Avoid_: Integration, Adapter, Provider, Endpoint

**REST connector**:
A Connector that calls an arbitrary endpoint: method, URL, auth, request body, and the path to the text in the response. How a customer reaches the OCR service their internal platform team fronts.
_Avoid_: HTTP connector, Custom endpoint, Webhook

**LLM connector**:
A Connector that calls a model by base URL and API key. Carries credentials and so is handled as a secret.
_Avoid_: Model, Provider, Model config

**Credential**:
Any secret held by a Connector. Never logged, never returned to a client, never in git.
_Avoid_: API key, Secret, Token — use the specific one in conversation

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
