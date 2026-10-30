import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveValue } from '../src/lib/segment.ts';

const items = [{ value: 'formatted', label: 'Formatted' }, { value: 'raw', label: 'Raw' }];

test('the bound value selects its own item', () => {
  assert.equal(resolveValue('raw', items), 'raw');
  assert.equal(resolveValue('formatted', items), 'formatted');
});

test('a value that is not in the item list resolves to the first item', () => {
  assert.equal(resolveValue('nope', items), 'formatted');
  assert.equal(resolveValue('', items), 'formatted');
  assert.equal(resolveValue(undefined, items), 'formatted');
});

test('no items means no selection to point at', () => {
  assert.equal(resolveValue('raw', []), undefined);
});
