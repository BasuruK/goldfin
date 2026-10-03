# A re-attempt is a new Run, and a Run copies the Connector definition it used

A Document that fails is terminal, and a Connector fault is the single most likely
reason. A customer whose OCR gateway times out on 2 of 50 documents fixes the gateway
and has no route to a score that reflects the fix. Worse, the fault is invisible in the
number: Coverage is fixed at the Document count, so a Run with 2 dead Documents reads
"47 of 50" exactly like a Run where 2 Documents ran and extracted the wrong value. The
misattribution the entire product exists to prevent arrives through the scoring path,
late, and permanently.

This ADR settles how a failed Document is re-attempted and what a Run must remember
about the Connectors it called, because the second is what makes the first safe. They
are one decision: the reason "fix the Connector, run again" is honest is that a Run
knows what the Connector *was*, not merely which Connector it referenced.

## A re-attempt is a new Run

A re-attempt is a Run. It is not a Run-level action, not a new entity, and it does not
touch the Run that failed. The failed Document belongs to that Run, permanently, along
with the Stage it died at and why.

This is not a new idea in this codebase; it is the rule three tickets had already
reached from three directions. Rescoring is a new Run. A re-judge is a new Run, which
is what makes a flip between Runs on identical inputs computable. A credential
rotation is a new generation, so the confound lands between two Runs where it is
visible. A re-attempt is the same move applied to the one case that had none.

**There is no "re-run failed documents" action**, by design. A new Run is a full Run,
so the feature has no behaviour narrower than "run it again" and a button labelled
after a state machine value would teach users a concept the system does not have. The
affordance is a **pre-filled draft** off the source Run — same Dataset version, same
Prompt version, same Connectors — whose only visible delta is whatever the user just
changed. Naming that delta is the point; it is the first screen that makes a Connector
fix legible as a change rather than as noise.

## A Run copies the resolved definition of each Connector it uses

At start, a Run copies the **definition** of every Connector it calls — method, URL,
headers, body template, response path — rather than referencing the Connector entity.
The copy is what an earlier Run means, forever.

This extends the Credential rule from ADR 0005 to the half of a Connector that ADR
0005 did not reach. A Credential was made versioned, immutable and pinned precisely so
that editing a Connector could not retroactively change what a Run had measured — but
only the **auth** half was protected. Method, URL, body and response path were left
editable in place, with no generation and no record. So a customer could fix a
`response_path` and every Run that had used the old one silently meant something else.
The secret half of a Connector got a version history; the diagnostic half got nothing,
and the diagnostic half is the one that moves scores.

Snapshotting rather than versioning is deliberate. Versioning would buy a
configuration-diff history nobody has asked for, and would make Connector the only
versioned thing in the system whose versions carry no secret — a distinction with
nothing to protect. A copy satisfies `Attestable` completely and adds no entity.

`{{credential}}` placeholders are copied as placeholders, and the pinned credential
generation is recorded beside the copy. The "plaintext exists in exactly two places"
guarantee from ADR 0005 is unchanged: a snapshot is a request *template*, not a
resolved request, and carries no secret by construction.

## A new Run re-executes every Document

It does not inherit the previous Run's Extractions for the Documents that succeeded.

The cost argument against that is not the argument. The argument is that an inherited
Run is a chimera: the snapshot describes the Documents the Run actually executed, and
the other 48 were produced under a definition the Run does not record. Its header
names a configuration that did not produce most of its own numbers.

Worse, the edit that prompted a re-attempt is a Connector edit, and Goldfin cannot tell
whether it was scoped. A raised timeout leaves the other 48 valid; a corrected response
path leaves all 50 suspect. ADR 0002 says a format is declared, never inferred, and
inheritance would require the customer to **declare** that their edit changes nothing
else — a human claim sitting underneath a number sold to a regulated buyer. That is the
same hole ADR 0006 rejected as a "disagree" button, and it breaks `Attestable` at the
root.

The cost is bounded by machinery that already exists: the per-Connector concurrency,
the per-call and per-Document timeout budgets, and the worker-enforced token cap from
ADR 0001. A clean A/B — same Dataset version, same Prompt version, one named difference
— is worth more than a cheaper number nobody can attribute.

## What a Comparison must carry

A third class of non-comparability, at **Run** level rather than Field level.

ADR 0006 created two, both per-Field: a Field whose `scoring` changed, and a Judge
verdict that flipped on identical inputs. A Connector change is not per-Field. A wrong
`response_path` degrades every Field on every Document at once, which is the entire
reason Stages exist. Now that a Run copies its Connector definition, the difference is
detectable for free — the same split ADR 0006 drew: **detection belongs here, display
belongs to the Comparison screen.**

The distinction between the three is the value. A `scoring` change and a Connector
change both altered the **inputs**; a Judge flip altered nothing but the grader, which
is why it is computable rather than a warning.

The document-level reconciliation line the state-machine work established — "4 documents
yielded no Extraction — 2 OCR failed, 2 not reached" — must appear on **both** sides of
a Comparison, split by cause, and a change in that count is itself a non-comparability.
Without it a Run with 2 dead Documents and a Run with 0 are two readings of "of 50",
and the user is shown a score that moved for a reason the screen cannot name. A
`cancelled` Document is a third bucket on that line, since cancellation is terminal in
exactly the way failure is.

## Failure is immutable; repetition is derived

A Document's failure reason is written once on the transition and never overwritten.
It is evidence, and under this ADR nothing can overwrite it, because the attempt that
would have overwritten it is a different Run.

Whether a Document has failed *before* is a **derived read over Runs** — "failed in 3
of the last 4 Runs" — and never stored on the Document. It changes no number, and it is
the difference between an unlucky call and a broken gateway, which is the question a
customer is actually asking when they look at a fault. Storing it would put mutable
state on a Document, and a Document's state is written on transitions only — this would
be the first thing to break that.

## Considered Options

- **Reset `failed` Documents to `pending` and hand them to Resume** — rejected. It
  mutates a score that has already been shown, which is the one thing the Verdict
  freeze exists to prevent. ADR 0005 and ADR 0006 already drew this line twice: *`Attestable`
  holds for the record, not for re-execution.*
- **A "Retry" or "Run attempt" entity hanging off a Run** — rejected. It would be the
  only mutable entity in a system whose other three — `Dataset version`, `Prompt
  version`, Credential generation — are all immutable, and it would exist to do
  something a Run already does.
- **Nothing; the status quo is the escape** — rejected as a dead end. #2 makes a
  Dataset version editable only until a Run references it, so Run A pointing at v1
  forces a v2, and the resulting Comparison spans two Dataset versions with different
  denominators — non-comparable by Goldfin's own rule. The only route to a score
  reflecting a fixed connector yields a score that may not be compared to the old one.
- **Inherit the prior Run's Extractions** — rejected above.
- **Version the Connector into immutable, customer-labelled generations** — rejected
  for now, and revisited the day a human misses an edit and asks which Runs used the
  old one. A snapshot answers the question that matters; a version history answers one
  nobody has asked.
- **A "re-run failed documents" button** — rejected. Under this ADR it can only mean
  "run it again", and naming it after a state machine value teaches a concept the data
  model does not have.
- **Partial re-execution behind an explicit customer declaration** — considered and not
  taken for v1. It is the only shape that could make partial re-attempt honest, and it
  should return as a new effort rather than as a feature flag on this one.

## Consequences

- **A failed Document is never re-entered, in any Run.** The recovery path is a new
  Run, and that is the whole of it.
- **Every Run records what each Connector was.** Connector edits are safe, and an
  earlier Run can always be read back as it actually ran.
- **The re-run affordance is a draft, and the draft names its delta.** The snapshot is
  what makes the delta computable; without it the screen would be a pre-filled form
  and the user would be asked to remember what they changed.
- **Connector edits are a third class of non-comparability**, detected here, displayed
  on the Comparison screen.
- **The Comparison screen gains the document-level failure line on both sides**, with
  `cancelled` as its own bucket, and flags a change in that count.
- **A failure history is a read, not a write.** No new mutable state on a Document.
- **An incomplete Run is not rescued.** A Run that stopped on the token cap or on
  `stopped_on_connector_fault` is still incomplete; re-running produces a new complete
  Run, and the old one stays flagged.

## Out of scope here

Where raw Connector payloads live and how long they are kept is a separate question,
and this ADR does not touch it. One thing to record so it is not re-derived: a Run's
Connector snapshot is a request **template**, not a payload, and it carries no secret by
construction because `{{credential}}` survives into the copy as a placeholder.
