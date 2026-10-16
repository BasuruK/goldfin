import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { clearLegacyData, createEmptyConnector, hasLegacyData } from '../../src/lib/connectors/storage.js';

const STORAGE_KEY = 'goldfin.connectors.v1';

describe('legacy Connector data', () => {
  /** @type {Storage} */
  let memory;

  beforeEach(() => {
    memory = {
      store: new Map(),
      getItem(key) {
        return this.store.get(key) ?? null;
      },
      setItem(key, value) {
        this.store.set(key, value);
      },
      removeItem(key) {
        this.store.delete(key);
      },
      clear() {
        this.store.clear();
      },
      key() {
        return null;
      },
      get length() {
        return this.store.size;
      }
    };
    globalThis.localStorage = memory;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('detects legacy data without reading it as Connectors', () => {
    assert.equal(hasLegacyData(), false);
    memory.setItem(STORAGE_KEY, '[{"apiKey":"plaintext"}]');
    assert.equal(hasLegacyData(), true);
  });

  it('clears only the legacy key and reports success', () => {
    memory.setItem(STORAGE_KEY, '[]');
    memory.setItem('goldfin.theme', 'dark');
    assert.equal(clearLegacyData(), true);
    assert.equal(hasLegacyData(), false);
    assert.equal(memory.getItem('goldfin.theme'), 'dark');
    assert.equal(clearLegacyData(), true);
  });

  it('is safe when storage is unavailable', () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    assert.equal(hasLegacyData(), false);
    assert.equal(clearLegacyData(), false);
  });
});

describe('createEmptyConnector', () => {
  it('creates an in-memory draft with an empty Credential and label', () => {
    const draft = createEmptyConnector('web_request');
    assert.equal(draft.providerType, 'web_request');
    assert.equal(draft.apiKey, '');
    assert.equal(draft.credentialLabel, '');
    assert.deepEqual(draft.models, []);
    assert.equal(draft.catalogState, 'idle');
  });
});
