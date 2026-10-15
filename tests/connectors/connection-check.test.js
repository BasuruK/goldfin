import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  connectionFailureField,
  finishConnectionCheck,
  runConnectionCheck,
  validateBaseUrl,
  validateForCheck
} from '../../src/lib/connectors/connection-check.js';
import { makeRecord } from './fixtures.js';

describe('validateBaseUrl', () => {
  it('rejects empty', () => {
    assert.equal(validateBaseUrl(''), 'Base URL is required.');
  });

  it('accepts https', () => {
    assert.equal(validateBaseUrl('https://api.openai.com/v1'), null);
  });

  it('accepts http on loopback only', () => {
    assert.equal(validateBaseUrl('http://127.0.0.1:8080/v1'), null);
    assert.match(String(validateBaseUrl('http://api.example.com/v1')), /https/);
  });

  it('rejects garbage', () => {
    assert.match(String(validateBaseUrl('not-a-url')), /valid URL/);
  });
});

describe('finishConnectionCheck', () => {
  /** @type {import('../../src/lib/connectors/connection-check.js').CheckResult} */
  const result = { status: 'ok', message: 'Reachable' };
  const checkedAt = '2026-10-12T00:00:00Z';
  it('applies the current reply to an unchanged connection', () => {
    const record = makeRecord({ checkRequestId: 'current', connectionStatus: 'testing' });
    assert.deepEqual(finishConnectionCheck(record, 'current', result, checkedAt), {
      ...record, connectionStatus: 'ok', connectionMessage: 'Reachable', lastCheckedAt: checkedAt
    });
  });
  it('ignores a reply after connection changes invalidate its request', () => {
    const record = makeRecord({ checkRequestId: null, connectionStatus: 'idle' });
    assert.equal(finishConnectionCheck(record, 'old', result, checkedAt), record);
  });
  it('ignores a superseded request', () => {
    const record = makeRecord({ checkRequestId: 'new', connectionStatus: 'testing' });
    assert.equal(finishConnectionCheck(record, 'old', result, checkedAt), record);
  });
  it('ignores a deleted Connector', () => {
    assert.equal(finishConnectionCheck(undefined, 'old', result, checkedAt), undefined);
  });
});

describe('validateForCheck', () => {
  it('requires api key for openai', () => {
    assert.match(
      String(validateForCheck({ baseUrl: 'https://api.openai.com/v1', apiKey: '', providerType: 'openai' })),
      /API Key/
    );
  });

  it('maps validation messages to fields', () => {
    assert.equal(connectionFailureField('Base URL is required.'), 'baseUrl');
    assert.equal(connectionFailureField('API Key is required.'), 'apiKey');
    assert.equal(connectionFailureField('HTTP 401 from api.openai.com.'), null);
  });

  it('allows empty key for web_request', () => {
    assert.equal(
      validateForCheck({
        baseUrl: 'https://example.com/hook',
        apiKey: '',
        providerType: 'web_request'
      }),
      null
    );
  });
});

describe('runConnectionCheck', () => {
  it('returns field null for HTTP errors', async () => {
    mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 401 }));
    const result = await runConnectionCheck({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      providerType: 'openai'
    });
    assert.equal(result.status, 'failed');
    assert.equal(result.field, null);
    assert.match(result.message, /401/);
    mock.restoreAll();
  });

  it('fails when the request times out', async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    mock.method(AbortSignal, 'timeout', () => realTimeout(50));
    mock.method(globalThis, 'fetch', async (/** @type {string} */ _url, /** @type {RequestInit | undefined} */ init) => {
      const signal = init?.signal;
      await new Promise((_resolve, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')));
        }
      });
    });
    const result = await runConnectionCheck({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      providerType: 'openai'
    });
    assert.equal(result.status, 'failed');
    assert.match(result.message, /timed out/i);
    mock.restoreAll();
  });
});
