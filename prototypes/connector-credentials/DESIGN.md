# Connector credentials — prototype

Throwaway prototype answering one question for [Wayfinder #7](https://github.com/BasuruK/goldfin/issues/7):

> What should the Connector + credential surface look like, and does the generation
> lifecycle — rotate → supersede → tombstone — feel right in your hands?

```
index.html      markup + design tokens as CSS variables, and all the logic in one inline script
test/           node --test over the pure helpers (11 tests)
assets/         header-orb.png, copied from ../mlsvc-tester-2a
```

## Run

Double-click `index.html`. The script is inline rather than an ES module, so unlike
`../mlsvc-tester-2a` this one does **not** need `python3 -m http.server`.

```sh
node --test
```

## Design system

Tokens and components are copied verbatim from
[`../mlsvc-tester-2a`](../mlsvc-tester-2a/index.html) — the `--ubg/--usurf/--uwell/--uline`
surfaces, the `--key/--str/--num/--ok/--bad` data colours, the `.chip[data-tone]`,
`.pill`, `.btn`, `.seg`, `.field`, `.jsonbox`, `.k-*` and `.col-run` vocabulary, the
`cubic-bezier(.22,1,.32,1)` easing, and the `data-theme` light mode with its
`.theme-btn`. Header orb included.

The variants are meant to be judged against real furniture, not in a vacuum. Kept as-is
rather than renamed: the system calls its accent colour `--key`, which here also means
credential. The collision is noted in a comment at the top of the stylesheet.

## The three variants

Structurally different positions, not three skins. Switch with `?variant=A|B|C`, the
bottom bar, or `←` / `→`.

- **A — Inline on the Connector.** The credential is a field in the connector's own
  request config, with the generation history as a list underneath. One screen does
  everything; the mental model is "this request and its key are one thing".
- **B — Registry.** Credentials are top-level entities; a connector references one by
  name and holds no key UI. Rotation and burning are vault operations. Two panes.
- **C — Point of use.** The connector config holds only a *reference*. The pin, the key
  label and the fault line surface on the Run panel, where a credential's consequence is
  actually felt. The mental model: the key matters at the moment it was used.

## Decisions this is meant to stress

All from #7's grill. Each is visible in the prototype rather than described in prose:

| Decision | Where to see it |
| --- | --- |
| A Run pins the generation it started with | C's *Bound at start*; the pin chip on `g1` |
| A pinned generation cannot be tombstoned | **Tombstone** on `rotated 3 Aug` → refusal |
| An unpinned one burns, and the Connector then cannot test | **Tombstone** on `rotated 12 Sep` → **Test** refuses |
| Rotation appends, never mutates | **Rotate** — `g3` appears, `g1`/`g2` keep their labels and status |
| Nothing derived from the value is returned | the write-only field: no last-4, no hash prefix, only a `set_at` |
| A Connector test never echoes the body | **Test connector** → response body row |
| A credential-shaped query param is refused | the live URL check; paste the `curl` line |
| Redaction is structure plus a scrubber | the log panel — raw key struck red, `«redacted»` green |
| A Connector with no Credential is legal | *Local test gateway* in the list |
| An `X-Api-Key` header is not a special case | *Internal OCR gateway* — `{{gateway-key}}` in a header, like any other |

## The scenario that is NOT this ticket's problem

The *Combined extract* connector exists in the fixture because it is a real customer
shape: one POST where the gateway runs OCR and the LLM and returns both. Credential-wise
it is already covered — an `X-Api-Key` header and its own key.

The Pipeline question it raised — whether a fused gateway is supported — was parked on
the wayfinder map and settled in [ADR 0009](../../docs/adr/0009-a-fused-gateway-is-supported.md):
**it is supported.** The prompt is an ordinary `{{prompt}}` template parameter, so it
reaches the model by the same path a document does, and a fused Run can still vary it.
What a fused Run loses is attribution of a `wrong` value, never a `missing` one, and
the Run says so in words.

An earlier version of this file claimed the system prompt lived inside the customer's
gateway. It did not — see the fixture below, which this file got wrong.

## Deliberate limitations

1. **No persistence.** State is in memory; a reload resets it.
2. **The run is mocked.** `run-1842` is a fixture, not an execution.
3. **The tests cover the pure helpers only** — URL refusal, redaction, the generation
   lifecycle. Rendering is untested and should stay that way.
4. **Test results are fixed.** Latency and status are constants, not measurements.
5. **Not production code.** Rewritten properly when the winning variant is folded in.
