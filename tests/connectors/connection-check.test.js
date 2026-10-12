import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  connectionFailureField,
  finishConnectionCheck,
  validateBaseUrl,
  validateForCheck
} from '../../src/lib/connectors/connection-check.js';

describe('validateBaseUrl', () => {
  it('rejects empty', () => {
    assert.equal(validateBaseUrl(''), 'Base URL is required.');
  });

  it('accepts https', () => {
    assert.equal(validateBaseUrl('https://api.openai.com/v1'), null);
  });

  it('rejects garbage', () => {
    assert.match(validateBaseUrl('not-a-url'), /valid URL/);
  });
});

describe('finishConnectionCheck', () => {
  const result = { status: 'ok', message: 'Reachable' };
  const checkedAt = '2026-10-12T00:00:00Z';
  it('applies the current reply to an unchanged connection', () => {
    const record = { checkRequestId: 'current', connectionStatus: 'testing' };
    assert.deepEqual(finishConnectionCheck(record, 'current', result, checkedAt), {
      ...record, connectionStatus: 'ok', connectionMessage: 'Reachable', lastCheckedAt: checkedAt
    });
  });
  it('ignores a reply after connection changes invalidate its request', () => {
    const record = { checkRequestId: null, connectionStatus: 'idle' };
    assert.equal(finishConnectionCheck(record, 'old', result, checkedAt), record);
  });
  it('ignores a superseded request', () => {
    const record = { checkRequestId: 'new', connectionStatus: 'testing' };
    assert.equal(finishConnectionCheck(record, 'old', result, checkedAt), record);
  });
  it('ignores a deleted Connector', () => {
    assert.equal(finishConnectionCheck(undefined, 'old', result, checkedAt), undefined);
  });
});

describe('validateForCheck', () => {
  it('requires api key for openai', () => {
    assert.match(
      validateForCheck({ baseUrl: 'https://api.openai.com/v1', apiKey: '', providerType: 'openai' }),
      /API Key/
    );
  });

  it('maps validation messages to fields', () => {
    assert.equal(connectionFailureField('Base URL is required.'), 'baseUrl');
    assert.equal(connectionFailureField('API Key is required.'), 'apiKey');
    assert.equal(connectionFailureField('HTTP 401 from api.openai.com.'), 'baseUrl');
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
