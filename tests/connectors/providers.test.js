import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isProviderType } from '../../src/lib/connectors/providers.js';

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
