import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectionState, toggleAll } from '../src/lib/selection.js';
test('select-all sets enabled items, keeps existing order and leaves unknown values alone', () => {
  const items = [{ value: 'a' }, { value: 'b' }, { value: 'c', disabled: true }];
  assert.deepEqual(toggleAll(['z'], items, true), ['z', 'a', 'b']);
  assert.deepEqual(toggleAll(['a', 'z'], items, false), ['z']);
  assert.deepEqual(toggleAll([], items, true), ['a', 'b']);
});
test('select-all derives empty, partial and full states from known items', () => {
  const items = [{ value: 'a' }, { value: 'b' }];
  assert.deepEqual(selectionState([], items), { count: 0, checked: false, indeterminate: false });
  assert.equal(selectionState(['a'], items).indeterminate, true);
  assert.equal(selectionState(['a', 'b'], items).checked, true);
  assert.equal(selectionState([], []).checked, false);
});
test('disabled items keep their selection and do not count towards select-all', () => {
  const items = [{ value: 'a' }, { value: 'b' }, { value: 'c', disabled: true }];
  assert.deepEqual(toggleAll(['c', 'a'], items, false), ['c']);
  assert.deepEqual(toggleAll(['c'], items, true), ['c', 'a', 'b']);
  assert.deepEqual(selectionState(['a', 'b'], items), { count: 2, checked: true, indeterminate: false });
  assert.deepEqual(selectionState(['c'], items), { count: 1, checked: false, indeterminate: false });
  assert.equal(selectionState(['c'], [{ value: 'c', disabled: true }]).checked, false);
});
