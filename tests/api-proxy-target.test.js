import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_API_HOST,
  apiProxyTarget,
  resolveApiProxyTarget
} from '../api-proxy-target.js';

describe('apiProxyTarget', () => {
  it('defaults blank input', () => {
    assert.equal(apiProxyTarget(''), `http://${DEFAULT_API_HOST}`);
    assert.equal(apiProxyTarget('   '), `http://${DEFAULT_API_HOST}`);
  });

  it('accepts host:port without protocol', () => {
    assert.equal(apiProxyTarget('127.0.0.1:9000'), 'http://127.0.0.1:9000');
  });

  it('accepts absolute URLs case-insensitively', () => {
    assert.equal(apiProxyTarget('HTTP://127.0.0.1:8080'), 'HTTP://127.0.0.1:8080');
    assert.equal(apiProxyTarget('https://api.example.com'), 'https://api.example.com');
  });

  it('rewrites 0.0.0.0 bind address for local proxy', () => {
    assert.equal(apiProxyTarget('0.0.0.0:8080'), 'http://127.0.0.1:8080');
  });
});

describe('resolveApiProxyTarget', () => {
  it('prefers API_ORIGIN when set', () => {
    assert.equal(resolveApiProxyTarget('127.0.0.1:9000', '127.0.0.1:8080'), 'http://127.0.0.1:9000');
  });

  it('falls back to API_ADDR when API_ORIGIN is blank', () => {
    assert.equal(resolveApiProxyTarget('', '127.0.0.1:9000'), 'http://127.0.0.1:9000');
    assert.equal(resolveApiProxyTarget(undefined, '127.0.0.1:9000'), 'http://127.0.0.1:9000');
  });
});
