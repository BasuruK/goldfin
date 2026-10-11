import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  connectionFailureField,
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
