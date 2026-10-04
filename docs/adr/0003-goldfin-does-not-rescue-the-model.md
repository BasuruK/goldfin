# Goldfin does not rescue the model

A Run scores the customer's Prompt version against their production deployment, so Goldfin never lends the model help the customer will not have: it sends no output schema, appends no format reminder, never retries a malformed answer, never falls back to the Judge for a value that will not normalize, and never infers an undeclared format. Every one of those five is a real rescue, and every one of them would make the score a measurement of Goldfin rather than of the prompt.

## Considered options

**Schema-constrained output.** Goldfin sends the Field manifest as a JSON schema and the service enforces types. Higher extraction rates, and it removes the "model returned prose" failure mode entirely, and that is the point at which it becomes wrong. That failure mode *is* a property of the prompt, and it is often the most expensive defect the customer has. A schema would also be Goldfin doing the extraction work the product exists to measure.

**Retry a malformed answer.** Re-asking turns a Run into a best-of-N sample. Two costs. `Attestable` requires that a Run be reproducible exactly, which holds only when the number of calls is a function of the Run rather than of its content. And any retry that actually repairs the output needs a format reminder appended, at which point Goldfin is inside the prompt, and the Run scores a wrapper the customer never deployed.

**Judge fallback on an unparseable value.** A Judge asked whether `01/04/2025` matches `2025-04-01` has to guess the format, which is the inference ADR 0002 forbids, and that inference is now performed by a paid call, once per bad value, against a token cap.

## Consequences

Unusable output is cheap to record and loud to report. A model that returns prose instead of JSON makes every declared Field `missing`, which is a 50-field wall that says *your prompt is broken* more plainly than any error banner could.

`unparseable` stays terminal and a Field's declared type is the only arbiter of what counts as a value: an absent key or an explicit `null` is `missing` before the type is consulted, while `""` is handed to Normalization, where `text` accepts it and a typed Field rejects it.

The principle is worth stating as a test for future features: if a proposed change makes the model more likely to succeed, Goldfin is now grading its own homework. The one deliberate exception is transport: retries for 429, 5xx and timeouts stay, because the network failing says nothing about the prompt.
