import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectionState } from '../src/lib/selection.js';
test('select-all derives empty, partial and full states from known items', () => {
  const items = [{ value: 'a' }, { value: 'b' }];
  assert.deepEqual(selectionState([], items), { count: 0, checked: false, indeterminate: false });
  assert.equal(selectionState(['a'], items).indeterminate, true);
  assert.equal(selectionState(['a', 'b'], items).checked, true);
  assert.equal(selectionState([], []).checked, false);
});
