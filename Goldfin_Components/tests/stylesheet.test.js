import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// ponytail: covers SplitPane only. A component's class: directive and the rule it targets are
// one contract split across two files, and nothing in the build fails when they drift apart.
test('SplitPane collapsed class matches the stylesheet selector', () => {
  const [, collapsed] = read('../src/lib/SplitPane.svelte').match(/class:([\w-]+)=/);
  assert.ok(read('../src/goldfin.css').includes(`.divider.${collapsed}`), `no .divider.${collapsed} rule in goldfin.css`);
});
