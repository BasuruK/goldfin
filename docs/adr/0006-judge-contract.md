# The Judge decides, abstains, or is wrong, and never returns a number

The Judge is the only probabilistic component Goldfin ships, in a product sold to
regulated buyers. This ADR fixes what it may return, what it may not, what it costs, and
what happens when the customer does not believe it.

The principle underneath: **the Judge is Goldfin's instrument, not the customer's
deployment.** The customer's system prompt is the thing under evaluation. Anything that
grades it stays ours, ours alone, so that the number a regulated buyer is shown is
traceable to something they can audit and not to a text box someone typed in a hurry.

## Return vocabulary

The Judge returns exactly three things per Field, and a persisted rationale:

- `match` — the Extraction is correct for this Ground truth.
- `wrong` — it is a well-formed Extraction of a different value.
- `unsure` — it will not decide.

**No number of any kind.** No score, no confidence, no grade. The Judge is a comparator
with an explicit abstention, and that is the whole of it.

### Why no confidence

Because a model's self-reported confidence is not calibrated, and a number that looks
like evidence but is not is worse than no number. Put a `0.92` in front of a financial
institution and they will triage with it; it will say 0.95 on a coin flip. That produces
exactly the artefact this ADR exists to prevent — a score that looks softer than it is,
wearing the costume of precision.

The honest alternative is **self-consistency**: run the Judge three times and treat
agreement as the confidence. That number is real, it is calibrated by construction, and
it costs three calls per Field. It was considered and **not taken in v1** — it triples
the only call in Goldfin that buys no new information about the customer's prompt, and
#4's cost model was not built for it. If a customer needs calibrated judge confidence,
that is a conversation about their budget, not a silent default.

## Abstention is a miss, not a gap

An `unsure` records a **`wrong` carrying a persisted `judge_unsure` condition**.

It does not record a sixth Match outcome, and it does not record no Match at all. Both
were rejected on arithmetic: #2 fixed Coverage at the Dataset version's Document count
and every Field owes a Match per Document, so an abstention that wrote no row would leave
that Field's score uncomputable. And it does not record a `match`, because a Judge that
will not decide is telling us it has no evidence, and scoring that as agreement hands the
customer's prompt a point for ambiguity.

So the score counts an abstention as a miss — the conservative direction: the value was
never confirmed correct — and the condition says why. A Field reads "47 of 50, of which 3
the Judge would not decide." This is the #16 `ground_truth_absent` precedent exactly: a
condition persisted on a Verdict, never a new outcome.

## What the Judge never does

- It never rescues `missing` or `unparseable`. #3 and #9 closed that; a Judge comparing
  `01/04/2025` with `2025-04-01` would be guessing a format inside a paid call.
- It is never consulted unless the Field's `scoring` is `judge` — chosen per Field by the
  customer in the Manifest (#2). It is not a fallback for a Field that failed
  deterministically, because a rescue hatch consulted only on the hard cases is a second
  scorer wearing a helper's hat.
- It is never the primary scorer. An escape hatch, always.

## Invocation

One call per **Judge-scored Field per Document**. Nothing else is coherent: per-Dataset
would let a single verdict stand in for thousands, and per-Document would collapse
Field-level attribution, which is the entire reason the Pipeline is split.

## The judge prompt

**Goldfin ships it, versioned, and the customer cannot edit it.** It is persisted with
every verdict, alongside the model version and the raw output, so any Run can be replayed.

The reasoning is #3's, applied to prompts: Normalization is a closed catalog with no
user-authored rules, because a rule a customer wrote is a rule nobody can audit. A
user-editable judge prompt is worse still, because the Judge grades the customer's prompt
— letting the customer author both means the grader belongs to the graded. It is also
unversioned in practice: people tune it mid-investigation and last month's Runs quietly
stop meaning anything.

A customer who needs domain-specific judging does not get a text box. They get a
conversation, and it becomes part of the shipped catalog.

## Cost

Judge calls **share the extraction's token cap and budget** — one wallet, one number to
explain — but they are broken out on their own line in the cost breakdown, and a Run
carries a **separate per-Run Judge call ceiling** that ends the Run with its own terminal
reason.

The ceiling exists because a Judge that silently consumes the extraction's budget turns a
scoring decision into a cost incident, and the Run then fails for a reason that has
nothing to do with the prompt being evaluated. That is the worst available failure mode
for an evaluation tool: the thing under test disappears behind the thing measuring it.

## Comparability across a Comparator change

A Comparison **may** span a Field whose `scoring` differs between the two Runs, and it
**must** flag every such Field and mark those scores not comparable.

Refusing the comparison outright would be wrong — the customer's change sometimes *is*
the scoring method, and refusing to compare is refusing the question the product exists
to answer. But a Field score that moved because the comparator changed is not evidence
the prompt improved, and a Comparison that quietly presents it as a win is how a bad
prompt change gets shipped.

## No override

A user cannot override a Judge verdict. There is no disagree button that changes a
score.

A human override is not reproducible, and it makes the number depend on who was looking —
the exact opposite of what a regulated buyer is paying for. It also breaks `Attestable`
at the root.

The recourse is a **new Run against a new Dataset version** with the Field's `scoring`
flipped to `deterministic`. That is a real escape hatch rather than a brush-off: it
yields a number the customer can defend to a regulator without appealing to a model.

## Reproducibility, and the re-judge

**Goldfin does not promise that re-running a Run reproduces it.** No provider offers
determinism, and claiming it in a regulated sale ends the sale.

What Goldfin promises is narrower and true: the Verdict is frozen with its inputs, so a
score can always be read back exactly as it was shown. Re-running produces a *new* Verdict
set, which is why #3 made rescoring a new Run in the first place.

To make the Judge's own variance measurable rather than mysterious, a **re-judge** action
reuses the **frozen Extraction** from a completed Run and re-runs only the Judge. One
call instead of a whole Pipeline pass, and it isolates the Judge completely — the inputs
are byte-identical, so any difference is the Judge's.

The re-judge exists for the uncomfortable consequence. Because both verdicts are frozen
by construction, **a flip between two Runs on identical inputs is computable**, and
surfacing it is not optional: "on 11 Fields the Judge decided differently on identical
inputs" is the honest sentence, and if the product cannot say it, then the number was
softer than it looked all along.

## Considered Options

- **A `confidence` on every verdict** — rejected. Uncalibrated, and it invites exactly
  the false precision the Trust question is about.
- **Self-consistency, three Judge calls per Field** — real and calibrated, rejected for
  v1 on cost. Noted above as a budget conversation, not a default.
- **A sixth Match outcome for abstention** — rejected. #3 settled five; a sixth is how a
  vocabulary stops being explainable.
- **An abstention writing no Match** — rejected on arithmetic. Coverage is the Document
  count; a Field with a hole in it has no score.
- **An abstention scoring as `match`** — rejected. It rewards ambiguity.
- **A user-editable judge prompt** — rejected. Unauditable, unversioned in practice, and
  it hands the grader to the graded.
- **Consulting the Judge only when deterministic fails** — rejected. A comparator
  consulted only on the cases it cannot handle is not a comparator.
- **A "disagree" button that overrides the score** — rejected. Breaks `Attestable` and
  makes the score observer-dependent.
- **A separate Judge budget** — rejected. Two budgets is two things to explain, and the
  customer's money is the customer's money. One cap, two lines, one ceiling.

## Consequences

- **`unsure` is a miss that admits it.** The score stays honest, and the count of
  abstentions is visible per Field rather than buried in prose.
- **The Judge's prompt is a shipped artifact.** Changing it is a Goldfin release with a
  new version number, persisted on every verdict it produces, which is what makes old
  Runs readable.
- **Two classes of non-comparability become computable** — a Field whose `scoring`
  changed, and a Judge verdict that flipped on identical inputs. Whether the Comparison
  screen displays them is a separate decision, tracked on the wayfinder map; the
  obligation to be able to detect them is not.
- **`Attestable` holds for the record, not for re-execution.** The same distinction the
  credential ADR draws: a frozen verdict is always readable, and a fresh Run is a new
  claim.
- **The judge coverage is a first-class number**, and it will be uncomfortable more often
  than anyone would like. That is the price of the only probabilistic thing in the
  product being the Judge and nothing else.
