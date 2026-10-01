# MLSVC Tester — design 2a prototype

Standalone recreation of handoff design **2a** ("Prompt · Result · Run panel") from
`design_handoff_mlsvc_tester_2a/README.md`. Plain HTML/CSS + one ES module, no framework, no build step.

```
index.html      markup + the design tokens as CSS variables (dark default, light via [data-theme])
app.js          pure helpers (exported, unit-tested) + the DOM layer
fixtures.js     system prompt, sample extraction, OCR text, model price table
test/           node --test suite over the pure helpers
assets/         header-orb.png from the handoff
```

## Run

ES modules need an origin, so `file://` will not work:

```sh
python3 -m http.server 8731   # then open http://localhost:8731/
node --test                   # 25 tests
```

## What the prototype keeps from the handoff

- 56px header over a 3-column body grid, `100dvh`, no outer frame or radius.
- Resizable prompt/result/run columns with 1px dividers, per-column minimums, double-click reset to 520/308.
- Collapsible run panel on the right divider, 320ms `cubic-bezier(.22,1,.32,1)`, knob never starts a drag.
- Formatted ⇄ JSON result viewer, per-node folding, `{ n items }` counts, long-string fold at 110 chars,
  null gutter with the `--badbg` / `--uhl` cycle through the `<n> missing` button.
- Run phases with the sea-wave rise/sink, live elapsed counter, previous JSON dimmed to 40% while running.
- Copy label crossfading Copy JSON ⇄ Copy Raw Text with the tab, width animated to the measured label.
- Model dropdown with list pricing, per-model price overrides (`USD · custom` + Reset), cost and budget bar.
- Theme toggle, Esc/⌘↵ keys, `role="status"` live region, `prefers-reduced-motion` static sea.

## Deliberate deviations

1. **No in-place restyle.** The handoff targets `MLSVCTester/index.html` + `app.js`. That project is not
   on this machine, so this is a fresh, self-contained build rather than a modification of existing files.
2. **The run is mocked.** `runExtraction()` honours the contract the real endpoint has to meet — cancellable
   promise, token usage, measured latency, rejection on a missing document or an over-budget response —
   but resolves from the fixture after 5.2–7.8s. Nothing leaves the browser.
3. **JSON view keeps container commas.** The reference's `tree2()` omits the trailing comma on an *expanded*
   container's opening line, which renders invalid JSON in the JSON tab. Fixed here; a test locks it.
4. **Numbers are derived, not typed in.** Tokens come from `chars / 4` on the live prompt and the live
   result, and latency is measured. The prototype's hardcoded 1,893 / 836 / 6.4 s / "14:32" are gone.
5. **The sample result is preloaded** as the page's last response so the layout can be judged on open.
   Last-run stats deliberately read `—` / "no run yet" until a real run happens — nothing pretends to be measured.
6. **Header orb** uses `object-fit: cover` with `object-position: 51% 84%` rather than the hand-sized
   1611×65px placement, which was a prototype-canvas artefact.
7. **A11y additions:** both dividers are focusable separators with arrow-key resizing (shift = coarse step,
   Home = reset), and the drop zone responds to Enter/Space.
8. **`[hidden] { display: none !important }`** is required, not decorative: `.dd-menu` and `.btn` set
   `display: flex`, and any author rule beats the UA stylesheet's `[hidden] { display: none }`.

## Wiring the real endpoint

Replace the body of `runExtraction()` with the `recipe/execute` call. It must keep returning
`{ result, ocrText, document, usage: { promptTokens, completionTokens, total }, latencyMs }` and must
honour `signal` so the Stop button still works. Everything downstream — pills, cost, budget bar, missing
count — is derived from that one shape.
