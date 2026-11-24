import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pagesHint, pickConnectorId, planAnalysis } from '../../src/lib/ocr/api.ts';
import type { SavedConnector } from '../../src/lib/connectors/api.ts';

const pdf = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });

const documentIntelligence: SavedConnector = {
  id: 'c1',
  name: 'OCR',
  providerType: 'azure_document_intelligence',
  baseUrl: 'https://ocr.example.cognitiveservices.azure.com'
};

const foundry: SavedConnector = {
  id: 'c2',
  name: 'Foundry',
  providerType: 'azure_foundry',
  baseUrl: 'https://my-resource.services.ai.azure.com',
  models: [
    { id: 'mistral-document-ai-2505', enabled: true },
    { id: 'other-model', enabled: false }
  ]
};

test('Analyze asks for a Document first, then a Connector, and runs with both', () => {
  assert.deepEqual(planAnalysis(null, '', undefined, ''), {
    kind: 'invalid',
    field: 'document',
    message: 'Choose a PDF, JPEG, PNG, or DOCX file.'
  });
  assert.deepEqual(planAnalysis(pdf, '', undefined, ''), {
    kind: 'invalid',
    field: 'connector',
    message: 'Choose an Azure OCR Connector.'
  });
  assert.deepEqual(planAnalysis(pdf, 'c1', documentIntelligence, ''), {
    kind: 'run',
    document: pdf,
    connectorId: 'c1'
  });
});

test('Analyze refuses a Document the upload rules reject, with their message', () => {
  const big = new File([new Uint8Array(1)], 'big.pdf', { type: 'application/pdf' });
  Object.defineProperty(big, 'size', { value: 30_000_001 });
  assert.deepEqual(planAnalysis(big, 'c1', documentIntelligence, ''), {
    kind: 'invalid',
    field: 'document',
    message: 'Request is too large.'
  });
});

test('Foundry Connectors require an enabled model; Document Intelligence never sends modelId', () => {
  const noModels: SavedConnector = { ...foundry, models: [{ id: 'm', enabled: false }] };
  assert.deepEqual(planAnalysis(pdf, 'c2', noModels, ''), {
    kind: 'invalid',
    field: 'model',
    message: 'Choose an enabled model on this Connector.'
  });
  assert.deepEqual(planAnalysis(pdf, 'c2', foundry, ''), {
    kind: 'run',
    document: pdf,
    connectorId: 'c2',
    modelId: 'mistral-document-ai-2505'
  });
  assert.deepEqual(planAnalysis(pdf, 'c2', foundry, 'other-model'), {
    kind: 'run',
    document: pdf,
    connectorId: 'c2',
    modelId: 'mistral-document-ai-2505'
  });
  assert.deepEqual(planAnalysis(pdf, 'c1', documentIntelligence, 'mistral-document-ai-2505'), {
    kind: 'run',
    document: pdf,
    connectorId: 'c1'
  });
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