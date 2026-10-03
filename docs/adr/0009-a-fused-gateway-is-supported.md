# A fused gateway is supported, and the prompt still reaches the model

A customer gateway that runs OCR **and** the LLM in a single POST, returning both
halves, is a real shape. It is not hypothetical: the prototype built for ADR 0005
carries one as a fixture, and its author labelled it "a real customer shape".

The recorded warning about it was wrong, and the way it was wrong is this ADR's reason
to exist. ADR 0005 and the prototype's design notes both asserted that in this shape
"the system prompt is inside the customer's gateway". The fixture the same session
wrote says the opposite:

```js
{ id: 'combined', name: 'Combined extract', stage: 'one call, both stages',
  body: '{"file":"{{document}}","prompt":"{{prompt}}"}', responsePath: 'result' }
```

The prompt is a **request parameter**. `{{prompt}}` is substituted exactly as
`{{document}}` and `{{credential}}` are, so the prompt reaches the model by the same
path a document does. A warning written from a connector's *name* rather than its
*body* had already parked a false premise on the map, and three tickets were about to
build on it.

That error matters more than the shape does. If the prompt really were buried in the
gateway, Goldfin could not vary it, "is v2 better than v1?" would stop being a question
the product answers, and the product would no longer be this product. The premise was
load-bearing and it was unsupported.

## The two-Stage split is not a Connector requirement

A Pipeline still has two Stages. What varies is whether one Connector serves both.

Goldfin's differentiator is that it speaks a customer's internal endpoint natively,
with no customer code. A customer whose platform team has fused their OCR and LLM
behind one POST is *more* likely to need Goldfin, not less — refusing it would refuse
the customer's actual gateway, which is the thing the map exists to reach.

A **fused Connector** is therefore a supported shape. It is not refused, it is not
flagged, and it requires no declaration from the user.

**It is not detectable, and this is the reason there is no flag.** A fused Connector's
configuration is identical to a split one: same method, same body template, same
response path. Nothing in the definition distinguishes them. ADR 0005's precedent —
refusing a credential-shaped query parameter at save time — works because the shape is
*present in the text to be inspected*. A fused gateway leaves nothing to inspect, so
any edge here would require the customer to declare the shape, which is a worse product
than saying yes.

## A `missing` is still attributed; a `wrong` never is

The two-tier attribution split survives, and it survives **asymmetrically** — which is
the opposite of what the ticket feared.

A `missing` keeps its owner. The fused response carries both halves, so Goldfin holds
the OCR text *and* sees the LLM return no value. That is precisely the evidence the
state machine called evidence rather than inference: OCR returned text and the
extraction declined. Nothing about a fused call weakens it.

A `wrong` loses its owner, and does so **permanently**. "Locate the loss" has no
mechanism here: there is no separable Stage to re-run, and the obvious fallback is
worse than useless. Re-running the extraction half against a Goldfin-side LLM
Connector would measure *Goldfin's* model, not the customer's — the grader belonging to
the graded, which is the wall ADR 0003 puts around the Judge and around every other
place Goldfin might otherwise make the model look better. So this is not a feature
deferred; it is an answer.

A fused Run therefore offers **"locate the loss" as absent, not as broken**. A button
that is hidden with no explanation teaches that the product is incomplete; a button
that is present and refuses teaches the truth. The Comparison says so in words.

## What is stated, and where

On the Run and the Comparison, in words: *attribution unavailable — this Run used a
single-call gateway.*

The obligation is a display one, and it exists because silence is the worst available
outcome. An unattributable score is shaped exactly like an attributable one — same
Field, same `wrong`, same number — until someone is asked to defend it to a regulator.
A score that cannot say which Stage lost the value must not be permitted to look like
one that can.

## No new class of non-comparability

A fused-versus-split change is a **Connector change**, and ADR 0008 already classes
that as non-comparability at Run level. It is detectable for free, because a Run copies
the definition it used. A fused Run is comparable to another fused Run; it is not
comparable to a split one, and that difference needs no category of its own.

## What this amends

- **ADR 0005** — its closing note is corrected. The premise that the prompt lives
  inside the customer's gateway was wrong, and the credential conclusion drawn from it
  (that the shape is already covered) was right for the wrong reason. It is covered
  because the prompt is an ordinary template parameter, like the document.
- **#2 is confirmed, not amended.** "The OCR Stage always runs. There is no pre-OCR'd
  text path in v1" still holds: the OCR Stage does run on every Document, inside the
  customer's gateway rather than in a separate call. A fused gateway is not a
  pre-OCR'd text path.
- **#8** — `missing` attribution is **unaffected**. `failed` "records which Stage and
  why" is **narrowed** to naming the fused gateway, since there is no separable Stage
  to name. `wrong` was already unattributed in a pipeline Run and is now unattributable
  in principle, with no re-run escape.
- **#13** — "the Stage it died at" is narrowed to the gateway that died. The snapshot
  rule is unaffected and is what makes a fused Run auditable at all.
- **#14 is unblocked**, unchanged. Its answer is still needed for the split case, which
  is the common one; the fused case was never going to have a mechanism.
- **ADR 0001** — "a Run over N documents performs N OCR calls plus N LLM calls" is
  false in a fused shape. The single-writer invariant is untouched; only the arithmetic
  changes.
- **ADR 0003** — untouched. Its five refusals are all about output shape. A fused
  gateway changes neither.

## Considered Options

- **Refuse the fused shape at Connector save time** — rejected, and not because it is
  unkind. The shape is undetectable, so a refusal edge could only exist as a
  customer declaration, which is worse than support: it makes Goldfin ask a question it
  cannot verify the answer to. It would also refuse the customer's real gateway, which
  is the map's stated differentiator.
- **Require a declaration that the Connector is fused** — rejected for the same reason.
  A declaration nobody can check is a claim sitting underneath a number, which is the
  hole ADR 0006 rejected as a "disagree" button and ADR 0008 rejected for partial
  re-execution.
- **Offer "locate the loss" against a Goldfin-side LLM Connector** — rejected. It
  measures Goldfin's model rather than the customer's deployment. The value would look
  like attribution while being a second grader, which is precisely what the Judge is
  not allowed to be.
- **Let a fused Run score, with no statement of any kind** — rejected. This is the
  outcome the ticket called the worst available: an unattributable score is
  indistinguishable from an attributable one until a regulator asks.
- **Treat it as a different product** — rejected. The prompt is still a request
  parameter, so the product still varies it. What is lost is attribution, not the
  subject.

## Consequences

- **A fused gateway is a first-class supported shape**, with no refusal, no
  declaration, and no flag.
- **A `missing` keeps its Stage in a fused Run.** The two-tier split is preserved
  where evidence exists.
- **A `wrong` in a fused Run has no owner, ever**, and the Run says so in words.
- **"Locate the loss" is absent** on fused Runs, not present-and-failing.
- **ADR 0005's closing note is corrected**; the credential conclusion stands on a
  different and better ground.
- **The premise that a Connector must be splittable is gone** from the model. A future
  ticket must not re-derive it.
