import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AZURE_FOUNDRY_PROVIDER_TYPE,
  AZURE_OCR_PROVIDER_TYPE,
  isLlmProvider,
  isModelOwningProvider,
  isSavableProvider,
  providerByType
} from '../../src/lib/connectors/providers.ts';

test('Azure Foundry is savable and model-owning but not an LLM provider', () => {
  assert.equal(isSavableProvider(AZURE_FOUNDRY_PROVIDER_TYPE), true);
  assert.equal(isModelOwningProvider(AZURE_FOUNDRY_PROVIDER_TYPE), true);
  assert.equal(isLlmProvider(AZURE_FOUNDRY_PROVIDER_TYPE), false);
});

test('Document Intelligence is savable without owning models', () => {
  assert.equal(isSavableProvider(AZURE_OCR_PROVIDER_TYPE), true);
  assert.equal(isModelOwningProvider(AZURE_OCR_PROVIDER_TYPE), false);
});

test('the dead azure provider type is not listed', () => {
  assert.equal(providerByType('azure').value, 'openai');
});