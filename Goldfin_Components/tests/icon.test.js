import test from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, glyphForName } from '../src/lib/icons.js';

test('known names resolve to lineicons glyph ids', () => {
  assert.equal(glyphForName('chevron'), 'chevron-down');
  assert.equal(glyphForName('plug'), 'plug-1');
});

test('unknown names throw instead of falling back to chevron-down', () => {
  assert.throws(() => glyphForName('pluggg'), /unknown name "pluggg"/i);
  assert.throws(() => glyphForName(''), /unknown name ""/i);
});

test('every mapped name has a glyph id', () => {
  for (const [name, glyph] of Object.entries(GLYPHS)) {
    assert.ok(glyph, name);
  }
});
