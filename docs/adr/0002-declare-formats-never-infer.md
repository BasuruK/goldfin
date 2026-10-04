# Declare formats, never infer them

A Financial document is formatted, not typed. The same date is `14/03/2025`, `14.03.2025` and `2025-03-14`; the same amount is `1,234.56`, `1.234,56` and `EUR 1.234,56`. When a Normalization chain cannot parse a value unambiguously, Goldfin refuses to guess and the Field's Verdict is `unparseable`. The manifest declares the format, or the value is not scored.

## Context

"1.234" is 1234.00 in a German bank statement and 1.234 in an English one. "03/04/2025" is 3 April or 4 March. Any implementation that guesses is choosing a locale it was never told.

The cost of guessing is not a wrong number. It is a wrong number that is **indistinguishable from a model failure**. The Extraction is perfect, the score says `wrong`, and the user goes off to debug their system prompt instead of their parser. A product sold to a financial buyer on the strength of its numbers cannot spend its credibility on that.

It is also the failure that silently breaks the Comparison. Inference succeeds quietly, so a Run's score depends on the mix of documents inside it. Add one invoice from a second source and the number moves with no prompt change, no rule change, and no visible cause. "Is v2 better than v1?" becomes unanswerable, which is the question the whole product exists to serve.

## Considered Options

- **Infer against a shipped format list**: rejected. Silent success means the score drifts with the data, not with the prompt, so a prompt comparison measures the dataset instead of the prompt.
- **Infer only when every candidate format agrees, else `unparseable`**: rejected as unnecessary cleverness. Deterministic, and zero-config for the easy cases, but it reports a correctly-extracted `03/04/2025` as unparseable. An honest wrong answer the user can see and fix is worth more than a subtle rule they have to learn and then regard as a bug.
- **Declare**: chosen. `text` stays zero-config; only genuinely ambiguous Fields pay the cost, and they pay it in the manifest, where a mistake is found at ingest rather than after an afternoon of waiting for a score.

## Consequences

**The manifest is the place format errors surface, and it must fail loudly.** An ambiguous `date` or `decimal` Field with no declared format is an ingest failure, not a warning. A user who wanted inference will read this ADR.

**Some primitives take a declared argument**: `parse_date:%d/%m/%Y`, `parse_decimal:#,##0.00`, `normalize_boolean:<tokens>`. An argument is data in the manifest, exactly like a rule name, so this stays consistent with "a Field names a chain, never code" and introduces no execution surface.

**A numeric-typed account number silently corrupts a score.** `0012345` under `type=integer` normalises to `12345` and can never match its Ground truth. Account numbers and IBANs are `text` with `strip_whitespace`. Ingest must warn on a Field whose name and value pattern make this likely, because it is the most probable way a user breaks their own score without noticing.

**Rule behaviour is pinned by release, not by name.** A chain name says which rules ran; it does not say what they did, and a bug fix to `parse_decimal` changes the meaning of an unchanged chain. Every Verdict therefore records the resolved chain *and* the Goldfin version that applied it. See [What normalization and matching rules make a field score deterministic?](https://github.com/BasuruK/goldfin/issues/3).
