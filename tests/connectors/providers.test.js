import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PROVIDER_TYPE, PROVIDER_SELECT_ITEMS, isProviderType, providerByType } from '../../src/lib/connectors/providers.js';

describe('isProviderType', () => {
  it('accepts every known provider', () => {
    for (const value of ['openai', 'azure', 'openai_compatible', 'web_request']) {
      assert.equal(isProviderType(value), true, value);
    }
  });

  it('rejects unknown strings and non-strings', () => {
    for (const value of ['', 'OpenAI', 'anthropic', 'toString', null, undefined, 1, {}]) {
      assert.equal(isProviderType(value), false, String(value));
    }
  });
});

describe('DEFAULT_PROVIDER_TYPE', () => {
  it('is the first provider, the one providerByType falls back to', () => {
    assert.equal(isProviderType(DEFAULT_PROVIDER_TYPE), true);
    assert.equal(PROVIDER_SELECT_ITEMS[0].value, DEFAULT_PROVIDER_TYPE);
    assert.equal(providerByType(DEFAULT_PROVIDER_TYPE).value, DEFAULT_PROVIDER_TYPE);
  });
});
