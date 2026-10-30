import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeJsonLine, isNullLine, countChildItems, nodeRange, toggleFold, hiddenLines } from '../src/lib/json.ts';

const classesOf = (line: string) =>
  tokenizeJsonLine(line)
    .filter((t) => t.cls)
    .map((t) => `${t.text}|${t.cls}`);
const roundTrip = (line: string) => tokenizeJsonLine(line).map((t) => t.text).join('');

test('tokenizeJsonLine assigns classes, preserves escapes, and round-trips lines', () => {
  assert.deepEqual(classesOf('  "invoice": {'), ['"invoice"|k-key', ':|k-p', '{|k-p']);
  assert.deepEqual(classesOf('    "vendor": "Acme Corp",'), [
    '"vendor"|k-key',
    ':|k-p',
    '"Acme Corp"|k-str',
    ',|k-p',
  ]);
  assert.deepEqual(classesOf('    "amount": 2499.00,'), ['"amount"|k-key', ':|k-p', '2499.00|k-num', ',|k-p']);
  assert.deepEqual(classesOf('-42'), ['-42|k-num']);
  assert.deepEqual(classesOf('    "due_date": null,'), ['"due_date"|k-key', ':|k-p', 'null|k-bad', ',|k-p']);
  assert.deepEqual(classesOf('"paid": true'), ['"paid"|k-key', ':|k-p', 'true|k-ok']);
  assert.deepEqual(classesOf('"paid": false'), ['"paid"|k-key', ':|k-p', 'false|k-ok']);
  assert.deepEqual(classesOf('"note": "say \\"hi\\"",'), ['"note"|k-key', ':|k-p', '"say \\"hi\\""|k-str', ',|k-p']);

  for (const line of ['{', '  "a": [', '    "b": null', '  ]', '}', '']) {
    assert.equal(roundTrip(line), line);
  }
});

test('only lines ending in a null value are marked', () => {
  assert.equal(isNullLine('    "due_date": null,'), true);
  assert.equal(isNullLine('  "amount": null'), true);
  assert.equal(isNullLine('    "vendor": "null",'), false);
  assert.equal(isNullLine('  "amount": 2499.00,'), false);
});

test('countChildItems counts direct children and respects nesting, dedents, and blank lines', () => {
  assert.deepEqual(countChildItems(['{', '  "a": 1,', '  "b": 2,', '  "c": 3', '}']), [3, null, null, null, null]);

  const nested = ['{', '  "items": [', '    {', '      "x": 1', '    }', '  ],', '  "z": 2', '}'];
  assert.deepEqual(countChildItems(nested), [2, 1, 1, null, null, null, null, null]);

  const dedent = ['{', '  "a": {', '    "b": 1', '  },', '  "c": 2', '}'];
  assert.deepEqual(countChildItems(dedent), [2, 1, null, null, null, null]);

  assert.deepEqual(countChildItems(['{', '}']), [0, null]);
  assert.deepEqual(countChildItems(['  "a": 1,', '  "b": "x"']), [null, null]);
  assert.deepEqual(countChildItems(['{ "a": {} }']), [null]);

  const blanks = ['{', '  "a": 1,', '', '  "b": 2', '}'];
  assert.deepEqual(countChildItems(blanks), [2, null, null, null, null]);
});

const rangesOf = (lines: string[]) => lines.map((_, index) => nodeRange(lines, index));

test('nodeRange finds leaf lines, closing dedents, nested bounds, unclosed tails, and internal blanks', () => {
  const simple = ['{', '  "a": 1,', '}'];
  assert.deepEqual(nodeRange(simple, 1), { opens: false, end: 1 });

  const nested = ['{', '  "a": {', '    "b": 1', '  },', '  "c": 2', '}'];
  assert.deepEqual(nodeRange(nested, 1), { opens: true, end: 3 });
  assert.deepEqual(nodeRange(nested, 0), { opens: true, end: 5 });

  const arrayNest = ['{', '  "a": [', '    {', '      "x": 1', '    }', '  ],', '  "b": 2', '}'];
  assert.deepEqual(nodeRange(arrayNest, 1), { opens: true, end: 5 });
  assert.deepEqual(nodeRange(arrayNest, 2), { opens: true, end: 4 });
  assert.deepEqual(nodeRange(arrayNest, 0), { opens: true, end: 7 });

  const unclosed = ['{', '  "a": {', '    "b": 1'];
  assert.deepEqual(nodeRange(unclosed, 0), { opens: true, end: 2 });
  assert.deepEqual(nodeRange(unclosed, 1), { opens: true, end: 2 });

  const blanks = ['{', '  "a": {', '', '    "b": 1', '', '  },', '}'];
  assert.deepEqual(nodeRange(blanks, 1), { opens: true, end: 5 });
});

test('toggleFold and hiddenLines fold per line without mutating the caller set', () => {
  const empty = new Set<number>();
  const open = toggleFold(empty, 1);
  assert.deepEqual([...open], [1]);
  assert.equal(empty.size, 0, "the caller's set must not be mutated");
  assert.deepEqual([...toggleFold(open as Set<number>, 1)], []);

  const lines = ['{', '  "a": {', '    "x": 1', '  },', '  "b": {', '    "y": 2', '  }', '}'];
  const folded = toggleFold(toggleFold(new Set<number>(), 1), 4);
  assert.deepEqual([...folded].sort(), [1, 4]);
  assert.deepEqual(hiddenLines(rangesOf(lines), folded), [false, false, true, true, false, true, true, false]);

  const singleFold = ['{', '  "a": {', '    "x": 1', '  },', '  "b": 2', '}'];
  const ranges = rangesOf(singleFold);
  assert.deepEqual(hiddenLines(ranges, new Set([1])), [false, false, true, true, false, false]);

  const leaf = ['{', '  "a": 1', '}'];
  const leafRanges = rangesOf(leaf);
  assert.deepEqual(hiddenLines(leafRanges, new Set<number>([1])), [false, false, false]);
  assert.deepEqual(hiddenLines(leafRanges, new Set<number>([9])), [false, false, false]);
});
