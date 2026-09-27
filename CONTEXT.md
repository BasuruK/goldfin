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
A single named value a Dataset expects from each document, with a declared type and a normalization rule.
_Avoid_: Attribute, Column, Property, Key — _key_ is reserved for Connector credentials

**Ground truth**:
The value a Field is expected to hold, supplied by the customer. Goldfin never infers it.
_Avoid_: Expected value, Label, Answer, Correct output

**Normalization**:
The rule that makes two representations of the same value comparable before matching, such as date format or currency symbol. Deterministic scoring cannot exist without it.
_Avoid_: Canonicalization, Cleaning, Formatting

**Match**:
The verdict that a normalized Extraction equals its Ground truth. Three outcomes, not two: match, partial, miss.
_Avoid_: Correct, Pass, Diff

**Verdict**:
The persisted record of one Match, including what was compared, so a score can be reproduced later.
_Avoid_: Result, Score, Evidence

**Judge**:
The LLM that validates a non-string-comparable answer. An escape hatch, never the primary scorer.
_Avoid_: Validator, Reviewer, Grader

### The objects a user makes

**Dataset**:
A set of documents with their Ground truth, declaring the Fields to be scored.
_Avoid_: Test set, Corpus, Benchmark, Fixture

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
