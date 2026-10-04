# A blank cell is an assertion

#2 made `required` annotation-side — the Manifest must supply a value for every Document — which implies a Field declared `required=false` may have none. A blank Manifest cell is the customer's **claim that the Document carries no such value**, not a gap in the annotation, and it is scored like any other Ground truth. An absent Extraction against it is a `match`, which is what makes "the prompt did not invent a beneficiary" a thing the score can reward; anything the model emits is a `wrong` carrying a `ground_truth_absent` condition on the Verdict. Against an absent Ground truth the Field's declared type is **not consulted at all** — there is nothing to normalize toward — with one exception: `""` on a `text` Field says the same thing absence does, and so matches it.

`required` is what keeps this honest, and it is now two-state and load-bearing. `required=true` is a promise that every Document has a value; `required=false` is the customer saying absence is intended. A `required` Field with a blank cell for any Document is a self-contradicting Manifest, and it fails at ingest — it cannot be scored, because `missing` describes the Pipeline returning nothing and here the Manifest actively asserted something.

## Considered options

**The blank cell is a hole, not a claim.** Write no Match, make Coverage per-Field — "38 of 50" — and leave the model unjudged on those Documents. This is the exact mirror of #8's rule that a Document with no Extraction writes no Verdict, and it is tempting for precisely that reason. Rejected: it silently removes Documents from the denominator, which is the hidden-denominator failure GLOSSARY.md exists to prevent, and it flatters. Two Runs compared on a dataset where a quarter of the evidence quietly vanished will show an improvement that measures the dataset rather than the prompt. A scoreboard that improves when you stop looking is not an evaluation.

**A sixth Match reason, `not_applicable`.** Rejected for the reason #9 rejected a sixth reason on the extraction side: it buys a filter over a fact the Verdict already carries. The absence of Ground truth is persisted as a **condition** alongside the reason, not as a sixth reason, so the five-reason taxonomy and `matched / Coverage` both survive unchanged — while the UI can still split `wrong 15` into "3 wrong, 12 invented", which send a user to entirely different prompts to fix.

**Both, declared — a blank means a hole, an explicit marker such as `n/a` means absence.** The most faithful application of ADR 0002's "declared, never inferred", and it is the right answer if a blank cell is genuinely ambiguous. Rejected for v1: it costs a token the annotator must type on every absent cell, and it makes Coverage per-Field, giving a second place where the denominator can differ between two Fields of the same version. The reading taken is the strict one — a blank means what it says. If sparse annotation turns out to be a real customer problem, the escape hatch is an explicit hole marker, and adding it changes no existing score.

**The type is consulted first, so `"N/A"` on a `date` Field is `unparseable`.** Rejected because it reports the wrong defect. There was no Ground truth to misparse against; the fact is not "your value is malformed" but "you invented a date". The UI would say `unparseable 12` and send the user to debug their Normalization chain instead of their prompt — ADR 0002's exact failure, arriving from the opposite direction.

## Consequences

**Coverage does not move.** It is still the Dataset version's Document count, and `matched / Coverage` still holds. #2 and #8 are confirmed, not amended.

**This narrows ADR 0003.** That ADR's Consequences say a Field's declared type is the only arbiter of what counts as a value. It is the only arbiter *against a Ground truth that exists*. Against an absent one, there is no value to accept or refuse.

**A present Ground truth is never the empty string.** A blank cell is absence, so `""` cannot accidentally match a Ground truth, and the absent-versus-empty collision cannot arise on the ground-truth side at all. It only has to be arbitrated on the Extraction side, which #9 already did.

**A whitespace cell is a value, not a blank.** `required=true` with a cell holding only spaces is not a contradiction — it is a Ground truth that normalizes to empty and matches nothing, the same footgun #3 flagged for an account number typed `integer`. A customer's mistake, visible in the data.

**A Field group is untouched.** The group score is derived from its members, so `partial` keeps meaning `0 < matched < total`, including over a partly-absent set where some members are asserted absent. A group whose members are *all* asserted absent scores 100% when the model returned nothing every time. That is correct — and it is also a flattering number, so the display has to say how much of the group was absent on that Document. Which screen carries it is #6's problem, not this one's.
