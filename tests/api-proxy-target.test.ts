import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiProxyTarget } from '../api-proxy-target.ts';

describe('apiProxyTarget', () => {
  it('accepts an http(s) origin', () => {
    assert.equal(apiProxyTarget('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
    assert.equal(apiProxyTarget('https://api.example.com'), 'https://api.example.com');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(apiProxyTarget('  http://127.0.0.1:8080  '), 'http://127.0.0.1:8080');
  });

  it('normalizes a trailing slash', () => {
    assert.equal(apiProxyTarget('http://127.0.0.1:8080/'), 'http://127.0.0.1:8080');
  });

  it('rejects a path, query or fragment', () => {
    assert.throws(() => apiProxyTarget('http://127.0.0.1:8080/api'), /origin only/);
    assert.throws(() => apiProxyTarget('http://127.0.0.1:8080/?a=1'), /origin only/);
    assert.throws(() => apiProxyTarget('http://127.0.0.1:8080/#top'), /origin only/);
  });

  it('rejects a non-http scheme', () => {
    assert.throws(() => apiProxyTarget('ftp://api.example.com'), /must be http\(s\)/);
  });

  it('rejects empty, whitespace-only and missing values', () => {
    assert.throws(() => apiProxyTarget(''), /API_URL is not set/);
    assert.throws(() => apiProxyTarget('   '), /API_URL is not set/);
    assert.throws(() => apiProxyTarget(undefined), /API_URL is not set/);
  });

  it('rejects malformed input', () => {
    for (const value of ['127.0.0.1:8080', 'not a url']) {
      assert.throws(
        () => apiProxyTarget(value),
        (err) => err instanceof TypeError && err.message.includes('API_URL') && err.message.includes(value)
      );
    }
  });
});
