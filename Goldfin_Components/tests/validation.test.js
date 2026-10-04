import test from 'node:test';
import assert from 'node:assert/strict';
import { modelError, suiteError } from '../src/lib/validation.js';
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
