import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LAYOUT,
  LONG_STRING,
  budgetUsage,
  clampPromptWidth,
  clampRunWidth,
  containerLineNumbers,
  countTokens,
  describeError,
  estimateCost,
  formatNumber,
  formatTokens,
  gridColumns,
  nextMissingIndex,
  nullNodes,
  promptMeta,
  renderTree,
  resolvePrice,
  runExtraction,
  sanitizePrice,
  toTree,
  valueSegment,
} from '../app.js';

import { MODELS, SAMPLE_RESULT, SYSTEM_PROMPT } from '../fixtures.js';

const lineText = (row) => row.segs.map((seg) => seg.t).join('');
const findRow = (rows, n) => rows.find((row) => row.n === n);

test('toTree numbers lines and pairs open/close nodes', () => {
  const tree = toTree({ a: 1, b: [2] });
  assert.equal(tree[0].kind, 'open');
  assert.equal(tree[0].n, 1);
  assert.equal(tree[0].count, 2);
  assert.equal(tree.at(-1).kind, 'close');
  assert.equal(tree.at(-1).n, tree.length);
  tree.forEach((node, i) => assert.equal(node.n, i + 1));
});

test('toTree marks empty containers instead of emitting a close line', () => {
  const tree = toTree({ empty: [] });
  assert.deepEqual(tree.map((node) => node.kind), ['open', 'empty', 'close']);
  assert.equal(tree[1].isArray, true);
});

test('toTree flags null leaves only', () => {
  const tree = toTree({ missing: null, present: 0, empty: null, text: 'null' });
  const nulls = nullNodes(tree);
  assert.deepEqual(nulls.map((node) => node.key), ['missing', 'empty']);
  assert.ok(nulls.every((node) => node.kind === 'leaf'));
});

test('formatNumber keeps integer-typed fields integral', () => {
  assert.equal(formatNumber('subtotal', 14832), '14832.0');
  assert.equal(formatNumber('line_id', 2), '2');
  assert.equal(formatNumber('quantity', 4), '4');
  assert.equal(formatNumber('unit_price', 2158.1875), '2158.1875');
});

test('valueSegment colours by JSON type', () => {
  assert.deepEqual(valueSegment('a', null), { t: 'null', k: 'bad' });
  assert.deepEqual(valueSegment('a', 1), { t: '1.0', k: 'num' });
  assert.deepEqual(valueSegment('quantity', 1), { t: '1', k: 'num' });
  assert.deepEqual(valueSegment('a', true), { t: 'true', k: 'ok' });
  assert.deepEqual(valueSegment('a', 'x'), { t: '"x"', k: 'str' });
});

test('renderTree formatted view unquotes keys, drops commas, counts items', () => {
  const rows = renderTree(toTree({ name: 'a', items: [1] }), { formatted: true });
  assert.equal(lineText(rows[0]), '{ 2 items');
  assert.equal(lineText(findRow(rows, 2)), '  name: "a"');
  assert.ok(!lineText(findRow(rows, 2)).includes(','));
  assert.equal(lineText(findRow(rows, 3)), '  items: [ 1 items');
  assert.equal(lineText(findRow(rows, 5)), '  ]');
});

test('renderTree json view quotes keys and keeps commas', () => {
  const rows = renderTree(toTree({ name: 'a', items: [1] }), { formatted: false });
  assert.equal(lineText(rows[0]), '{');
  assert.equal(lineText(findRow(rows, 2)), '  "name": "a",');
  assert.equal(lineText(findRow(rows, 3)), '  "items": [');
  assert.equal(lineText(findRow(rows, 5)), '  ]');
  assert.equal(lineText(findRow(rows, 6)), '}');
});

test('renderTree json view keeps the comma on expanded container open lines', () => {
  const rows = renderTree(toTree({ a: 1, b: 2 }), { formatted: false });
  assert.equal(lineText(rows[0]), '{');
  assert.equal(lineText(findRow(rows, 2)), '  "a": 1.0,');
  assert.ok(!lineText(findRow(rows, 3)).includes(','), 'last member carries no comma');
  assert.equal(lineText(rows.at(-1)), '}');
});

test('renderTree numbers array children only in formatted view', () => {
  const formatted = renderTree(toTree({ list: [1, 2] }), { formatted: true });
  assert.equal(lineText(findRow(formatted, 3)), '    0: 1.0');
  assert.equal(lineText(findRow(formatted, 4)), '    1: 2.0');
  const json = renderTree(toTree({ list: [1, 2] }), { formatted: false });
  assert.equal(lineText(findRow(json, 3)), '    1.0,');
  assert.equal(lineText(findRow(json, 4)), '    2.0');
});

test('root is never foldable and collapse skips the whole subtree', () => {
  const tree = toTree({ list: [1, 2] });
  assert.equal(renderTree(tree, { formatted: true })[0].action, null);
  const collapsed = renderTree(tree, { formatted: true, collapsed: new Set([2]) });
  assert.equal(lineText(collapsed[1]), '  list: [ 2 items ]');
  assert.equal(collapsed.length, 3);
  assert.equal(collapsed[1].action.type, 'toggle-fold');
});

test('collapse all targets every non-root container', () => {
  const numbers = containerLineNumbers(toTree(SAMPLE_RESULT));
  assert.ok(numbers.length > 0);
  assert.ok(!numbers.includes(1));
});

test('long strings truncate in formatted view and only there', () => {
  const long = 'x'.repeat(LONG_STRING + 25);
  const tree = toTree({ note: long });

  const truncated = renderTree(tree, { formatted: true });
  assert.match(lineText(truncated[1]), /expand \(25 more characters\)/);
  assert.equal(truncated[1].action.type, 'toggle-expand');

  const expanded = renderTree(tree, { formatted: true, expanded: new Set([2]) });
  assert.match(lineText(expanded[1]), /collapse$/);
  assert.ok(lineText(expanded[1]).includes(long));

  const json = renderTree(tree, { formatted: false });
  assert.ok(lineText(json[1]).includes(long));
});

test('null rows get the missing background, the jumped row gets the highlight', () => {
  const tree = toTree({ missing: null });
  const rows = renderTree(tree, { formatted: true, jumpLine: 2 });
  assert.equal(rows[1].mark, '●');
  assert.equal(rows[1].background, 'uhl');
  const plain = renderTree(toTree({ missing: null }), { formatted: true });
  assert.equal(plain[1].background, 'badbg');
});

test('nextMissingIndex cycles and survives an empty list', () => {
  assert.equal(nextMissingIndex(3, -1), 0);
  assert.equal(nextMissingIndex(3, 2), 0);
  assert.equal(nextMissingIndex(3, 0), 1);
  assert.equal(nextMissingIndex(0, -1), -1);
});

test('sanitizePrice floors junk and negatives at zero', () => {
  assert.equal(sanitizePrice('1.75'), 1.75);
  assert.equal(sanitizePrice('0'), 0);
  assert.equal(sanitizePrice('-2'), 0);
  assert.equal(sanitizePrice('abc'), 0);
  assert.equal(sanitizePrice(''), 0);
  assert.equal(sanitizePrice(Number.NaN), 0);
});

test('resolvePrice falls back to list price and reports overrides', () => {
  assert.deepEqual(resolvePrice('gpt-5.1', {}), { input: 1.25, output: 10, custom: false });
  assert.deepEqual(resolvePrice('gpt-5.1', { 'gpt-5.1': { input: 3 } }), { input: 3, output: 10, custom: true });
  assert.deepEqual(resolvePrice('nope', {}), { input: 1.25, output: 10, custom: false });
});

test('estimateCost matches the pricing formula', () => {
  assert.equal(estimateCost({ promptTokens: 1893, completionTokens: 836, input: 1.25, output: 10 }), '$0.0107');
  assert.equal(estimateCost({ promptTokens: 0, completionTokens: 0, input: 1.25, output: 10 }), '$0.0000');
});

test('budgetUsage shares the bar and labels the budget', () => {
  const budget = budgetUsage(1893, 836, 16384);
  assert.equal(budget.label, '17% of 16,384');
  assert.ok(budget.prompt > budget.completion);
  const overflow = budgetUsage(16384, 16384, 16384);
  assert.equal(overflow.prompt, 100);
  assert.equal(overflow.completion, 100);
});

test('layout clamps respect every minimum', () => {
  const total = 1440;
  assert.equal(clampPromptWidth(10, 308, total), LAYOUT.promptMin);
  assert.equal(clampRunWidth(10, 520, total), LAYOUT.runMin);
  assert.equal(clampPromptWidth(total - 308 - 300, 308, total), total - 308 - LAYOUT.resultMin);
  assert.equal(clampRunWidth(total - 520 - 300, 520, total), total - 520 - LAYOUT.resultMin);
  assert.equal(gridColumns({ promptWidth: 520, runWidth: 308, runOpen: true }), '520px 1px minmax(0,1fr) 1px 308px');
  assert.equal(gridColumns({ promptWidth: 520, runWidth: 308, runOpen: false }), '520px 1px minmax(0,1fr) 1px 0px');
});

test('token and char formatting', () => {
  assert.equal(formatTokens(1893.4), '1,893');
  assert.equal(countTokens('12345678'), 2);
  assert.equal(promptMeta('12345678'), '8 chars · ≈0.0k tokens');
  assert.ok(SYSTEM_PROMPT.length > 1000);
  assert.equal(promptMeta(SYSTEM_PROMPT).endsWith('k tokens'), true);
});

test('runExtraction resolves with usage and latency', async () => {
  const outcome = await runExtraction({ latencyMs: 5 });
  assert.equal(outcome.result.main[0].invoice_id, 'INV-2024-0871');
  assert.equal(outcome.usage.promptTokens, countTokens(SYSTEM_PROMPT));
  assert.equal(outcome.usage.completionTokens, countTokens(JSON.stringify(SAMPLE_RESULT)));
  assert.equal(outcome.usage.total, outcome.usage.promptTokens + outcome.usage.completionTokens);
  assert.ok(outcome.latencyMs >= 0);
});

test('runExtraction aborts through the signal', async () => {
  const controller = new AbortController();
  const pending = runExtraction({ latencyMs: 5000, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

test('runExtraction rejects a missing document and an over-budget response', async () => {
  await assert.rejects(runExtraction({ document: null }), /No document loaded/);
  await assert.rejects(runExtraction({ maxTokens: 256 }), /over the 256 budget/);
});

test('describeError always yields a message', () => {
  assert.equal(describeError(new Error('boom')), 'boom');
  assert.equal(describeError(null), 'Request failed');
  assert.equal(describeError(new Error('')), 'Request failed');
});

test('model table matches the published list prices', () => {
  assert.deepEqual(Object.keys(MODELS), ['gpt-5.1', 'gpt-5.2', 'gpt-5.6-luna']);
  assert.deepEqual(MODELS['gpt-5.1'], { input: 1.25, output: 10, note: 'Default · recipe.json' });
  assert.deepEqual(MODELS['gpt-5.6-luna'], { input: 0.2, output: 1.2, note: 'Fast, low cost' });
});
