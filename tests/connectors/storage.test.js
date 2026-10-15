import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { loadConnectors, saveConnectors } from '../../src/lib/connectors/storage.js';

const STORAGE_KEY = 'goldfin.connectors.v1';

describe('loadConnectors', () => {
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
    delete globalThis.localStorage;
  });

  it('drops malformed entries and clears transient states', () => {
    memory.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'good',
          providerType: 'openai',
          name: 'OpenAI',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          connectionStatus: 'testing',
          connectionMessage: 'Checking…',
          catalogState: 'loading',
          catalogMessage: '',
          models: [],
          discoveryRevision: 0,
          updatedAt: '2026-01-01T00:00:00.000Z'
        },
        { providerType: 'openai' },
        null
      ])
    );
    const loaded = loadConnectors();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].connectionStatus, 'idle');
    assert.equal(loaded[0].catalogState, 'idle');
    assert.equal(loaded[0].checkRequestId, null);
    assert.equal(loaded[0].name, 'OpenAI');
  });

  it('returns empty when storage is corrupt', () => {
    memory.setItem(STORAGE_KEY, '{not json');
    assert.deepEqual(loadConnectors(), []);
  });
});
