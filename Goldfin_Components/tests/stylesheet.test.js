import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// ponytail: covers SplitPane only. A component's class: directive and the rule it targets are
// one contract split across two files, and nothing in the build fails when they drift apart.
test('SplitPane collapsed class matches the stylesheet selector', () => {
  const [, collapsed] = read('../src/lib/SplitPane.svelte').match(/class:([\w-]+)=/);
  assert.ok(read('../src/goldfin.css').includes(`.divider.${collapsed}`), `no .divider.${collapsed} rule in goldfin.css`);
});
// ponytail: the modal entrance keyframe and the rule that centres the dialog are the same
// contract. The keyframe animates `transform` from an untransformed state, so it has to
// restate the centring translate. Drop it and the dialog slides in off-centre for 200ms
// and nothing in the build notices.
test('modal-in keyframe restates the centring translate used to position the dialog', () => {
  const css = read('../src/goldfin.css');
  const centring = css.match(/\.gf-modal \{[^}]*transform:\s*(translate\([^;]+\))\s*;/)[1];
  const keyframe = css.match(/@keyframes modal-in \{[^}]*transform:\s*([^;]+)\s*;\s*\}/)[1];
  const squash = (s) => s.replace(/\s+/g, '');
  for (const part of centring.matchAll(/translate\([^)]+\)/g)) {
    assert.ok(squash(keyframe).includes(squash(part[0])), `modal-in drops ${part[0]}; the dialog opens off-centre`);
  }
});
// ponytail: the loading spinner is centred with `position: absolute`, which resolves against
// the nearest positioned ancestor. If .btn stops being a positioning context the spinner
// lands on some ancestor instead of the button, and the one-size rule in DESIGN.md breaks.
test('the button that the loading spinner centres inside is a positioning context', () => {
  const css = read('../src/goldfin.css');
  assert.ok(/\.btn \{[^}]*position:\s*relative/.test(css), '.btn is not position:relative, so the absolute spinner loses its containing block');
  assert.ok(/\.btn \.spinner \{[^}]*position:\s*absolute/.test(css), '.btn .spinner is not absolutely positioned');
});
// ponytail: the Run label fades faster on the way out, selected by aria-busy. If the
// component stops emitting that attribute the rule silently stops applying and the label
// goes back to a symmetric 400ms with no error anywhere.
test('RunButton emits the aria-busy that the asymmetric label fade selects on', () => {
  assert.ok(read('../src/lib/RunButton.svelte').includes('aria-busy={busy}'), 'RunButton no longer emits aria-busy');
  assert.ok(read('../src/goldfin.css').includes('.run-btn:not([aria-busy="true"]) .label'), 'the exit-duration override is gone');
});
