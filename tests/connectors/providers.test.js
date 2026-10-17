import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_PROVIDER_TYPE, providerByType } from '../../src/lib/connectors/providers.js';

describe('providerByType', () => {
  it('falls back to the default provider for an unknown type', () => {
    const unknown = /** @type {any} */ ('unknown-provider');
    assert.equal(providerByType(unknown).value, DEFAULT_PROVIDER_TYPE);
  });
});
