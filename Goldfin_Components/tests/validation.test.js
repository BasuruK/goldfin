import test from 'node:test';
import assert from 'node:assert/strict';
import { modelError, suiteError, matchesAccept } from '../src/lib/validation.js';
test('sample registry rejects misspellings and trims valid IDs', () => {
  assert.notEqual(modelError('gpt-4o-minii'), '');
  assert.equal(modelError(' gpt-4o-mini '), '');
});
test('suite name preserves the existing trimmed minimum length', () => {
  assert.notEqual(suiteError(' ab '), '');
  assert.equal(suiteError(' invoice-extraction '), '');
});
test('missing values are rejected without throwing', () => {
  assert.notEqual(modelError(null), '');
  assert.notEqual(suiteError(undefined), '');
});

const file = (name, type) => ({ name, type });
test('an extension matches the end of the name and ignores case', () => {
  assert.equal(matchesAccept(file('INV-1.PDF', 'application/pdf'), '.pdf'), true);
  assert.equal(matchesAccept(file('notes.txt', 'text/plain'), '.pdf,.json,.txt'), true);
  assert.equal(matchesAccept(file('notes.txt', 'text/plain'), '.txt '), true, 'entries are trimmed');
  assert.equal(matchesAccept(file('report.txt', 'text/plain'), '.pdf'), false);
});
test('a type/* prefix matches a MIME family and an exact entry matches exactly', () => {
  assert.equal(matchesAccept(file('shot.png', 'image/png'), 'image/*'), true);
  assert.equal(matchesAccept(file('shot.png', 'image/png'), 'image/*,application/pdf'), true);
  assert.equal(matchesAccept(file('data.csv', 'text/csv'), 'image/*'), false);
  assert.equal(matchesAccept(file('data.json', 'application/json'), 'application/json'), true);
  assert.equal(matchesAccept(file('data.json', 'application/json+ld'), 'application/json'), false);
});
test('an empty accept list accepts everything', () => {
  for (const accept of ['', '   ', ',', ' , ']) assert.equal(matchesAccept(file('anything.bin', 'application/octet-stream'), accept), true);
});
test('a missing file or type is rejected rather than throwing', () => {
  assert.equal(matchesAccept(undefined, '.pdf'), false);
  assert.equal(matchesAccept(file('plain.txt', ''), 'application/pdf'), false);
  assert.equal(matchesAccept(undefined, ''), true);
});
