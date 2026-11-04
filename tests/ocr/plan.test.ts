import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pagesHint, pickConnectorId, planAnalysis } from '../../src/lib/ocr/api.ts';

const pdf = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });

test('Analyze asks for a Document first, then a Connector, and runs with both', () => {
  assert.deepEqual(planAnalysis(null, ''), {
    kind: 'invalid',
    field: 'document',
    message: 'Choose a PDF, JPEG, PNG, or DOCX file.'
  });
  assert.deepEqual(planAnalysis(pdf, ''), {
    kind: 'invalid',
    field: 'connector',
    message: 'Choose an Azure OCR Connector.'
  });
  const plan = planAnalysis(pdf, 'c1');
  assert.equal(plan.kind, 'run');
  assert.equal(plan.document, pdf);
  assert.equal(plan.connectorId, 'c1');
});

test('Analyze refuses a Document the upload rules reject, with their message', () => {
  const big = new File([new Uint8Array(1)], 'big.pdf', { type: 'application/pdf' });
  Object.defineProperty(big, 'size', { value: 30_000_001 });
  assert.deepEqual(planAnalysis(big, 'c1'), { kind: 'invalid', field: 'document', message: 'Request is too large.' });
});

test('the status hint counts pages in the singular for one', () => {
  assert.equal(pagesHint(1), '1 page');
  assert.equal(pagesHint(3), '3 pages');
});

test('the chosen Connector stays while listed; otherwise the first listed one, or none', () => {
  const listed = [{ id: 'c1' }, { id: 'c2' }];
  assert.equal(pickConnectorId('c2', listed), 'c2');
  assert.equal(pickConnectorId('', listed), 'c1');
  assert.equal(pickConnectorId('gone', listed), 'c1');
  assert.equal(pickConnectorId('gone', []), '');
});
