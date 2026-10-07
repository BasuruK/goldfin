import test from 'node:test'; import assert from 'node:assert/strict'; import { compareValues, sortRows, nextDirection, sortLabel } from '../src/lib/table.js';
test('sort direction toggles on the same column only, and the label announces the next direction', () => {
  assert.equal(nextDirection('size', '', 'ascending'), 'ascending');
  assert.equal(nextDirection('size', 'size', 'ascending'), 'descending');
  assert.equal(nextDirection('size', 'size', 'descending'), 'ascending');
  assert.equal(nextDirection('size', 'name', 'ascending'), 'ascending');
  assert.equal(sortLabel('Size', 'descending'), 'Sort by Size, descending order');
});
test('natural order, missing values last, stable sorting without mutation', () => { assert(compareValues('TC-9','TC-10') < 0); assert.equal(compareValues(null, 1, 'descending'), 1); const rows=[{size:10},{size:null},{size:2}]; assert.deepEqual(sortRows(rows,'size','descending').map(r=>r.size),[10,2,null]); assert.deepEqual(rows.map(r=>r.size),[10,null,2]); });
test('mixed number and string values compare as text instead of NaN', () => { assert(compareValues(5, 'TC-9') < 0); assert(compareValues('TC-9', 5) > 0); });