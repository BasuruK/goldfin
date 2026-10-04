import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatValue, safeStringify } from '../src/lib/format.js';
test('slider values preserve decimal precision and integer grouping', () => {
  assert.equal(formatValue(0, 'decimal'), '0.0');
  assert.equal(formatValue(1.3, 'decimal'), '1.3');
  assert.equal(formatValue(16384), '16,384');
});
test('slider values coerce strings and group decimals in en-US', () => {
  assert.equal(formatValue('2', 'decimal'), '2.0');
  assert.equal(formatValue(1234.5, 'decimal'), '1,234.5');
  assert.equal(formatValue('16384'), '16,384');
});
test('JSON output falls back to a placeholder instead of throwing', () => {
  const circular = {}; circular.self = circular;
  assert.equal(safeStringify(circular), '[Unserializable value]');
  assert.equal(safeStringify(undefined), 'null');
  assert.equal(safeStringify({ a: 1 }), '{\n  "a": 1\n}');
});
