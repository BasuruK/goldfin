import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConfirmation, validSuiteName } from '../src/lib/confirmation.js';
import { createMosaicTiles, mosaicPeak } from '../src/lib/mosaic.js';
test('confirmation reports once and clears a previous successful result on reopen', () => {
  const results = []; const dialog = createConfirmation(result => results.push(result));
  dialog.begin(); dialog.confirm(); dialog.close(); dialog.close(); dialog.begin(); dialog.close();
  assert.deepEqual(results, ['confirmed', 'canceled']);
});
test('suite validation and mosaic timing preserve the sample behavior', () => {
  assert.equal(validSuiteName(' ab '), false); assert.equal(validSuiteName('invoice-extraction'), true);
  assert.deepEqual(createMosaicTiles(3, 2, () => .5).map(t => t.delay), [0, 60, 120, 0, 60, 120]);
  assert.equal(mosaicPeak(() => 0), .35); assert.equal(mosaicPeak(() => 1), .9);
});
