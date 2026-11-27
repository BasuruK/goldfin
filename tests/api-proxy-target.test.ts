import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { apiProxyTarget, devApiProxyTarget, PORTLESS_API_ORIGIN } from '../api-proxy-target.ts';

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

describe('devApiProxyTarget', () => {
  describe('with portlessActive true', () => {
    it('defaults missing API_URL to the portless api host', () => {
      assert.equal(devApiProxyTarget(undefined, true), PORTLESS_API_ORIGIN);
      assert.equal(devApiProxyTarget('', true), PORTLESS_API_ORIGIN);
      assert.equal(devApiProxyTarget('   ', true), PORTLESS_API_ORIGIN);
    });

    it('rewrites legacy loopback :8080 to the portless api host', () => {
      assert.equal(devApiProxyTarget('http://127.0.0.1:8080', true), PORTLESS_API_ORIGIN);
      assert.equal(devApiProxyTarget('http://127.0.0.1:8080/', true), PORTLESS_API_ORIGIN);
    });

    it('passes through an explicit portless origin', () => {
      assert.equal(devApiProxyTarget('https://api.goldfin.localhost', true), PORTLESS_API_ORIGIN);
    });

    it('passes through other explicit origins', () => {
      assert.equal(devApiProxyTarget('https://api.example.com', true), 'https://api.example.com');
    });
  });

  describe('with portlessActive false', () => {
    it('rejects missing API_URL like apiProxyTarget', () => {
      assert.throws(() => devApiProxyTarget(undefined, false), /API_URL is not set/);
      assert.throws(() => devApiProxyTarget('', false), /API_URL is not set/);
      assert.throws(() => devApiProxyTarget('   ', false), /API_URL is not set/);
    });

    it('keeps legacy loopback :8080 without rewriting', () => {
      assert.equal(devApiProxyTarget('http://127.0.0.1:8080', false), 'http://127.0.0.1:8080');
    });

    it('passes through other explicit origins', () => {
      assert.equal(devApiProxyTarget('https://api.goldfin.localhost', false), PORTLESS_API_ORIGIN);
    });
  });
});
