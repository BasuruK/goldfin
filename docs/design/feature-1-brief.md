# Feature 1: App shell and the Connector screen

**Status:** design not started. This is the input to OpenDesign.
**Decided:** [ADR 0010](../../docs/adr/0010-go-api-postgres-three-containers.md) and the glossary in
`GLOSSARY.md`. Everything below is settled: design *to* it, do not redesign it.

## What this feature is

Two things, shipped together, because the shell is worthless without something in it.

1. **The nav rail.** A left side panel giving the app a place to navigate from.
2. **The Connector screen.** The only live screen. Add a Connector, edit it, hold its Credential
   generations, and check that it answers.

**Connectors are the differentiator.** Everything else in this product exists to feed them. This screen
is the first thing anyone sees, so it is the screen that has to be right.

## Explicitly out of scope

Parked on purpose. If the design needs any of these, stop and park it:

- **Probe**: the mlsvc-style prompt + document + result screen. Real, defined in `GLOSSARY.md`, and
  **not this feature.** The mlsvc contract it will eventually use is in
  `prototypes/mlsvc-tester-2a/`; reuse it then, not now.
- Datasets, Prompts, Runs, Comparison, Reports. Every one.
- The `ocrText` cache.
- Any screen that shows **which Runs used a Connector**. A Connector screen holds no relationship to a
  Run; that question is answered on the Run, because that is where the number was sold.

## The five screens to design

1. **Connector list**: all Connectors, kind badge, name, model id, base URL host, when it was last
   edited.
2. **Connector form**: the create and edit surface. Small: **model id, base URL, kind**. That is
   nearly all of it. The Credential is not a field on the form; it is its own thing with its own
   history.
3. **Credential generations**: the list of keys for one Connector, and the two actions on them.
4. **Connector check**: the button, and the three different findings it can produce.
5. **Nav rail**: one live item, the rest visibly not built.

## Rules the design must not break

These come from `ADR 0005` and the map. They are not styling preferences.

- **A Credential value is never displayed.** Not in full, not last-4, not a length, not a fingerprint.
  The list shows a customer-supplied **label**, a status, and **when it was set**. The edit form shows
  an empty field with an "unchanged" marker. There is no reveal, no hover-to-show, no copy button.
- **Tombstone is not delete.** It keeps the id and the label and drops the value. It is destructive, it
  is a distinct action, and it asks for confirmation. There is no hard-delete button anywhere.
- **A Connector check reports what it proved, never a bare pass/fail.** The three kinds are verifiable
  to three different depths and the screen must not flatten them:
  - `llm`: makes a minimal completion, so it confirms base URL, Credential **and** model id. This is
    the only kind that gets a pass.
  - `ocr`: confirms only what that provider offers a cheap way to confirm. If that is reachability,
    it says reachability.
  - `fused`: **never renders as a pass.** A gateway that answers a POST with 200 and
    `{"error":"invalid key"}` in the body is an ordinary shape, so a status code proves the port is open
    and nothing about the configuration. Say exactly that, in words.
- **A check shows status, latency, whether the response path resolved, and the key's label.** It does
  **not** show a response body, and it does not show token usage. A check is not a scored call.
- **A check is a queued job, not a spinner on a request.** It crosses a container boundary into the
  worker. `queued` and `running` are different states and both need to be visible, or the button looks
  broken for the first second.
- **Not-built nav items are visibly not built.** Muted, no hover affordance, no route. A dead link is
  a lie the product tells on its first screen.

## States to draw for every one of the five

Empty (nothing created yet), loading, populated, validation error per field, save failed, and **the API
container unreachable**: that last one is a full-page state, not a toast, and it is the state you will
hit most while building this feature.

## Language

Use the words in `GLOSSARY.md`. **Connector**, **Credential**, **Credential generation**, **Connector
check**, **Stage**, **Run**, **Match**, **Verdict**. Two words to keep straight, because they are easy to
collapse and they are not the same thing:

- **Connector check**: confirms parameters, returns a finding, no model output.
- **Probe**: one call returning raw model output, no score. Different feature, later.

Do not call either of them a "test" in the interface as a noun. `Test` is a fine verb on a button.
