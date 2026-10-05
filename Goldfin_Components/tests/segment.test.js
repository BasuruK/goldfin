import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeIndex, resolveValue, thumbVars, shouldSlide } from '../src/lib/segment.js';

const items = [{ value: 'formatted', label: 'Formatted' }, { value: 'raw', label: 'Raw' }];
const boxes = [{ x: 2, width: 84 }, { x: 88, width: 52 }];

test('the bound value selects its own item', () => {
  assert.equal(activeIndex('raw', items), 1);
  assert.equal(activeIndex('formatted', items), 0);
});

test('an empty value falls back to the first item', () => {
  assert.equal(activeIndex('', items), 0);
  assert.equal(activeIndex(undefined, items), 0);
});

test('a value that is not in the item list cannot strand the indicator', () => {
  assert.equal(activeIndex('nope', items), 0);
});

test('a value that is not in the item list resolves to the first item', () => {
  assert.equal(resolveValue('raw', items), 'raw');
  assert.equal(resolveValue('nope', items), 'formatted');
  assert.equal(resolveValue('', items), 'formatted');
  assert.equal(resolveValue(undefined, items), 'formatted');
});

test('no items means no selection to point at', () => {
  assert.equal(activeIndex('raw', []), 0);
  assert.equal(resolveValue('raw', []), undefined);
  assert.equal(thumbVars([], 0), null);
});

test('the indicator takes the geometry of the selected segment', () => {
  assert.deepEqual(thumbVars(boxes, 0), { x: '2px', width: '84px' });
  assert.deepEqual(thumbVars(boxes, 1), { x: '88px', width: '52px' });
});

test('the indicator is placed with no size until a segment is measured', () => {
  assert.equal(thumbVars(boxes, 2), null);
  assert.equal(thumbVars(undefined, 0), null);
  assert.equal(thumbVars(boxes, -1), null);
});

test('the first placement is instant, every later move slides', () => {
  assert.equal(shouldSlide(null, 0), false);
  assert.equal(shouldSlide(0, 1), true);
  assert.equal(shouldSlide(1, 0), true);
  assert.equal(shouldSlide(1, 1), false);
});
