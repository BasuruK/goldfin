import test from 'node:test';
import assert from 'node:assert/strict';
import { glyphForName } from '../src/lib/icons.js';

test('known names resolve to lineicons glyph ids', () => {
  assert.equal(glyphForName('plug'), 'plug-1');
});

test('unknown names fall back to the chevron glyph', () => {
  assert.equal(glyphForName('pluggg'), 'chevron-down');
  assert.equal(glyphForName(''), 'chevron-down');
});
