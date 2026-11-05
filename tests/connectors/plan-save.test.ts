import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planSave } from '../../src/lib/connectors/api.ts';
import { makeRecord } from './fixtures.ts';

const llm = makeRecord({
  providerType: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test',
  credentialLabel: 'Prod',
  llmApiMode: 'responses',
  models: [
    { id: 'model-a', enabled: true, source: 'discovered', verified: true },
    { id: 'model-b', enabled: false, source: 'manual' }
  ]
});

test('an LLM draft sends its API mode and every model as { id, enabled }, and no API version', () => {
  assert.deepEqual(planSave(llm), {
    kind: 'save',
    request: {
      name: 'OpenAI',
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiVersion: undefined,
      llmApiMode: 'responses',
      models: [{ id: 'model-a', enabled: true }, { id: 'model-b', enabled: false }],
      credential: 'sk-test',
      credentialLabel: 'Prod'
    }
  });
});

test('an Azure OCR draft sends its trimmed API version, or the default when blank, and no LLM fields', () => {
  const azure = makeRecord({
    providerType: 'azure_document_intelligence',
    name: 'OCR',
    baseUrl: 'https://ocr.example.cognitiveservices.azure.com',
    apiKey: 'key',
    credentialLabel: 'Prod',
    apiVersion: ' 2023-07-31 '
  });
  const request = {
    name: 'OCR',
    providerType: 'azure_document_intelligence',
    baseUrl: 'https://ocr.example.cognitiveservices.azure.com',
    apiVersion: '2023-07-31',
    llmApiMode: undefined,
    models: undefined,
    credential: 'key',
    credentialLabel: 'Prod'
  };
  assert.deepEqual(planSave(azure), { kind: 'save', request });
  assert.deepEqual(planSave({ ...azure, apiVersion: ' ' }), {
    kind: 'save',
    request: { ...request, apiVersion: '2024-11-30' }
  });
});

test('a draft is refused for a provider that cannot save, an LLM without a key, or no enabled model', () => {
  assert.deepEqual(planSave(makeRecord({ providerType: 'azure' })), {
    kind: 'invalid',
    field: null,
    message: 'Saving is not available for this provider yet.'
  });
  assert.deepEqual(planSave({ ...llm, apiKey: ' ' }), {
    kind: 'invalid',
    field: 'credential',
    message: 'API Key is required for this provider.'
  });
  assert.deepEqual(planSave({ ...llm, models: [{ id: 'model-a', enabled: false, source: 'manual' }] }), {
    kind: 'invalid',
    field: 'models',
    message: 'Enable at least one model ID before saving.'
  });
});

test('the LLM key and model checks come before the field checks, in that order', () => {
  const blank = { ...llm, name: '', apiKey: '', models: [] };
  assert.deepEqual(planSave(blank), {
    kind: 'invalid',
    field: 'credential',
    message: 'API Key is required for this provider.'
  });
  assert.deepEqual(planSave({ ...blank, apiKey: ' ' }), {
    kind: 'invalid',
    field: 'credential',
    message: 'API Key is required for this provider.'
  });
  assert.deepEqual(planSave({ ...blank, apiKey: 'sk-test' }), {
    kind: 'invalid',
    field: 'models',
    message: 'Enable at least one model ID before saving.'
  });
});

test('a draft past those checks is refused with the field and message validateDraft returns', () => {
  assert.deepEqual(planSave({ ...llm, baseUrl: 'ftp://x' }), {
    kind: 'invalid',
    field: 'baseUrl',
    message: 'Enter a valid http(s) URL.'
  });
});
