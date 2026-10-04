# Validity asks whether a value is a legal instance of its type, and never touches the score

#3 kept Normalization and validity deliberately apart, on the assumption that validity
was out of scope. It is not out of scope: a hallucinated IBAN is not a near-miss, it is a
plausible-looking string that a payments system will reject downstream. This ADR admits
validity while keeping it strictly advisory, so the thing that gets stronger is the *read*
of a failure, not the number.

## Validity is not Normalization

A Normalization rule **transforms**. A validity check **judges**: it can pass or fail
without producing a value, which is a different kind of thing from a rule that only
rewrites. #3's model is untouched: the declared chain stays a pure transform pipeline, and
a value it cannot transform is still `unparseable`.

This is why validity is not a chain step. A step that can fail is a rule with two jobs.

## The boundary: no Ground truth, ever

**Validity asks whether a value is a legal instance of its declared type. It never
references Ground truth.**

That single sentence sorts out the four examples on the ticket, and two of them turn out
not to be validity problems at all:

- An IBAN failing mod-97, a card number failing Luhn, a currency code outside ISO 4217:
  all structural. The string is not a legal instance of what it claims to be, full stop.
- **A date in the future is not a validity problem.** The Ground truth is `2025-04-01`,
  the model said `2026-04-01`, that is `wrong`, and validity has nothing to add.

The distinction is the same declared-never-inferred discipline as ADR 0002: a format is
declared, and a comparison against Ground truth is the Comparator's job, not a checker
wearing a comparator's clothes.

### Validity is structural, never time-dependent

A check whose result depends on *when you run it* ("is this date in the future?") makes
a Verdict non-reproducible, and #3 froze Verdicts precisely so a score cannot change after
it has been shown. Keeping every shipped check structural keeps a Verdict true forever.

If someone later wants a freshness or staleness check, that is a new concept with its own
decision about reproducibility, not a validity rule.

## The check lives on the type, not the Field

The closed type enum from #2 carries an optional check. `iban` has mod-97,
`card_number` has Luhn, `currency` has ISO 4217 membership, `text` has none, because every
string is a legal `text`. A Field names a type and inherits the check; it cannot add one or
switch one off.

A check that is correct for an IBAN is correct for every IBAN, and a per-Field switch lets
a customer disable the exact thing that protects them. It also **collapses the
closed-versus-open question for free**: validity ships closed because the *types* already
are, so it introduces no new surface for a customer to author rules into. A check Goldfin
does not ship becomes part of the catalog, exactly as with Normalization and the Judge's
prompt. It is never a Field option.

## Advisory, always

A failed check persists as an **`invalid` condition on the Verdict**, beside the reason. The
score is untouched. It is not a sixth Match outcome and not a separate score dimension.

This is the third condition in the same family as `ground_truth_absent` (#16) and
`judge_unsure` (#5), which makes the pattern load-bearing rather than coincidental:
**failure carries conditions, never new outcomes.** A sixth outcome would reopen #3's
taxonomy for the third time in seven tickets, and every reopening so far has cost a
downstream ticket. A second score dimension is worse than either. A Field with two numbers
has no single answer to "is v2 better than v1?", which is the entire product.

### The hallucinated IBAN, answered

It **is** a `wrong`. The Ground truth differs, so the score is correct. The condition adds
*severity*, not correctness: this one would bounce in your payments system.

And note the inversion this exposes. A prompt that invents an IBAN is wrong whether or not
the invented string passes Luhn, and a Luhn-**valid** invented IBAN is the *worse* case,
because it sails straight through a downstream check. That is exactly why the signal wants
to be visible everywhere while the number stays where it is.

## The check runs on the normalized value

Not the raw extraction.

If a check fails **after** normalization, the fault may be **Goldfin's chain**, not the
customer's prompt. A Normalization rule that mangles a valid IBAN would otherwise be
recorded as a model failure, the precise misattribution the whole Stage design exists to
prevent. Checking the raw value cannot surface that, and running both buys a diagnostic
Goldfin does not need to persist.

A value that cannot be normalized is `unparseable` before validity is ever consulted. The
order is: normalize, then validate, then compare.

## Out of scope here

If the **customer's own Ground truth** fails a validity check (an IBAN in the Manifest
that does not pass mod-97), the comparison is meaningless and scoring it produces noise.
That is a Manifest mistake, not a scoring rule, and it is deliberately not resolved here.
It is owned by the manifest-severity ticket, which already has to decide what blocks
ingest and what only warns.
