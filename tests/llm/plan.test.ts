import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SavedConnector } from '../../src/lib/connectors/api.ts';
import { enabledModelIds, pickModelId, planLlmRun } from '../../src/lib/llm/api.ts';

const connector = (overrides: Partial<SavedConnector> = {}): SavedConnector => ({
  id: 'c1',
  name: 'Fixture',
  providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  llmApiMode: 'responses',
  models: [
    { id: 'model-a', enabled: true },
    { id: 'model-b', enabled: false }
  ],
  ...overrides
});

test('planning refuses a run with no extraction, no Connector, or no enabled model, naming the field', () => {
  const saved = connector();
  assert.deepEqual(planLlmRun('', 'c1', 'model-a', saved), {
    kind: 'invalid',
    field: 'input',
    message: 'Run OCR on a Document first.'
  });
  assert.deepEqual(planLlmRun('text', '', 'model-a', saved), {
    kind: 'invalid',
    field: 'connector',
    message: 'Choose an LLM Connector.'
  });
  assert.deepEqual(planLlmRun('text', 'c1', 'model-a', undefined), {
    kind: 'invalid',
    field: 'connector',
    message: 'Choose an LLM Connector.'
  });
  assert.deepEqual(planLlmRun('text', 'c1', 'model-a', connector({ models: [{ id: 'model-b', enabled: false }] })), {
    kind: 'invalid',
    field: 'model',
    message: 'Enable at least one model on this Connector.'
  });
});

test('planning defaults the model to the first enabled model of the chosen Connector', () => {
  const saved = connector();
  assert.deepEqual(planLlmRun('document text', 'c1', '', saved), {
    kind: 'run',
    connectorId: 'c1',
    modelId: 'model-a',
    input: 'document text'
  });
  assert.equal(pickModelId('', enabledModelIds(saved)), 'model-a');
  assert.equal(pickModelId('model-b', enabledModelIds(saved)), 'model-a');
  assert.equal(pickModelId('model-a', enabledModelIds(saved)), 'model-a');
});
