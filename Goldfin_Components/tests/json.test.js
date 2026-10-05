import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeJsonLine, isNullLine, countChildItems, nodeRange } from '../src/lib/json.js';
import { safeStringify } from '../src/lib/format.js';

const classesOf = line => tokenizeJsonLine(line).filter(t => t.cls).map(t => `${t.text}|${t.cls}`);
const roundTrip = line => tokenizeJsonLine(line).map(t => t.text).join('');

test('a quoted key is a key and its colon is punctuation', () => {
  assert.deepEqual(classesOf('  "invoice": {'), ['"invoice"|k-key', ':|k-p', '{|k-p']);
});
test('a quoted value is a string, not a key', () => {
  assert.deepEqual(classesOf('    "vendor": "Acme Corp",'), ['"vendor"|k-key', ':|k-p', '"Acme Corp"|k-str', ',|k-p']);
});
test('numbers keep their decimals and sign as one token', () => {
  assert.deepEqual(classesOf('    "amount": 2499.00,'), ['"amount"|k-key', ':|k-p', '2499.00|k-num', ',|k-p']);
  assert.deepEqual(classesOf('-42'), ['-42|k-num']);
});
test('null is the error class and booleans are the ok class', () => {
  assert.deepEqual(classesOf('    "due_date": null,'), ['"due_date"|k-key', ':|k-p', 'null|k-bad', ',|k-p']);
  assert.deepEqual(classesOf('"paid": true'), ['"paid"|k-key', ':|k-p', 'true|k-ok']);
  assert.deepEqual(classesOf('"paid": false'), ['"paid"|k-key', ':|k-p', 'false|k-ok']);
});
test('escaped quotes do not end the string early', () => {
  assert.deepEqual(classesOf('"note": "say \\"hi\\"",'), ['"note"|k-key', ':|k-p', '"say \\"hi\\""|k-str', ',|k-p']);
});
test('whitespace and blank lines survive unstyled', () => {
  assert.deepEqual(classesOf('    '), []);
  assert.deepEqual(classesOf(''), []);
  assert.deepEqual(tokenizeJsonLine('    '), [{ text: '    ', cls: null }]);
});
test('every line round-trips to its original text', () => {
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

test('a line that opens a node counts its direct children', () => {
  const lines = ['{', '  "a": 1,', '  "b": 2,', '  "c": 3', '}'];
  assert.deepEqual(countChildItems(lines), [3, null, null, null, null]);
});
test('a nested container counts as one child, not its own children', () => {
  const lines = ['{', '  "items": [', '    {', '      "x": 1', '    }', '  ],', '  "z": 2', '}'];
  assert.deepEqual(countChildItems(lines), [2, 1, 1, null, null, null, null, null]);
});
test('counting stops at the dedent that closes the node', () => {
  const lines = ['{', '  "a": {', '    "b": 1', '  },', '  "c": 2', '}'];
  assert.deepEqual(countChildItems(lines), [2, 1, null, null, null, null]);
});
test('an empty node counts zero and leaf lines count null', () => {
  assert.deepEqual(countChildItems(['{', '}']), [0, null]);
  assert.deepEqual(countChildItems(['  "a": 1,', '  "b": "x"']), [null, null]);
});
test('a single-line empty object is not treated as an opening node', () => {
  assert.deepEqual(countChildItems(['{ "a": {} }']), [null]);
});
test('blank lines inside a node are skipped, not counted', () => {
  const lines = ['{', '  "a": 1,', '', '  "b": 2', '}'];
  assert.deepEqual(countChildItems(lines), [2, null, null, null, null]);
});
test('counts match the shipped invoice sample', () => {
  const lines = safeStringify({ invoice: { number: 'INV-1', amount: 1 }, items: [{ a: 1, b: 2 }] }).split('\n');
  const counts = countChildItems(lines);
  assert.equal(counts[0], 2, 'root holds invoice and items');
  assert.equal(counts[1], 2, 'invoice holds number and amount');
  assert.equal(counts[5], 1, 'items holds one object');
  assert.equal(counts[6], 2, 'that object holds a and b');
});

test('a leaf line opens no node and its range is itself', () => {
  const lines = ['{', '  "a": 1,', '}'];
  assert.deepEqual(nodeRange(lines, 1), { opens: false, end: 1 });
});
test('a node range ends on the line that closes it', () => {
  const lines = ['{', '  "a": {', '    "b": 1', '  },', '  "c": 2', '}'];
  assert.deepEqual(nodeRange(lines, 1), { opens: true, end: 3 });
  assert.deepEqual(nodeRange(lines, 0), { opens: true, end: 5 });
});
test('a nested node range stops before its parent closes', () => {
  const lines = ['{', '  "a": [', '    {', '      "x": 1', '    }', '  ],', '  "b": 2', '}'];
  assert.deepEqual(nodeRange(lines, 1), { opens: true, end: 5 });
  assert.deepEqual(nodeRange(lines, 2), { opens: true, end: 4 });
  assert.deepEqual(nodeRange(lines, 0), { opens: true, end: 7 });
});
test('an unclosed node runs to the last line', () => {
  const lines = ['{', '  "a": {', '    "b": 1'];
  assert.deepEqual(nodeRange(lines, 0), { opens: true, end: 2 });
  assert.deepEqual(nodeRange(lines, 1), { opens: true, end: 2 });
});
test('blank lines inside a node do not end it early', () => {
  const lines = ['{', '  "a": {', '', '    "b": 1', '', '  },', '}'];
  assert.deepEqual(nodeRange(lines, 1), { opens: true, end: 5 });
});
