import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { runModelDiscovery } from '../../src/lib/connectors/discovery-client.js';

const originalFetch = global.fetch;
after(() => {
  global.fetch = originalFetch;
});

const config = {
  connectorId: 'c1',
  providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: 'sk-test'
};

test('discovery post reserves api_missing for network errors, 404, and 502-504', async () => {
  const cases = [
    { status: 0, code: 'api_missing' },
    { status: 404, code: 'api_missing' },
    { status: 502, code: 'api_missing' },
    { status: 503, code: 'api_missing' },
    { status: 504, code: 'api_missing' },
    { status: 500, code: undefined }
  ];
  for (const item of cases) {
    global.fetch = async () => {
      if (item.status === 0) throw new TypeError('fetch failed');
      return new Response('nope', { status: item.status });
    };
    await assert.rejects(runModelDiscovery(config), error => {
      assert.equal(error.code, item.code);
      return true;
    });
  }
});

test('discovery post maps fetch timeouts without api_missing', async () => {
  global.fetch = async () => {
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  };
  await assert.rejects(runModelDiscovery(config), error => {
    assert.equal(error.code, undefined);
    assert.match(error.message, /timed out/i);
    return true;
  });
});

test('discovery post uses the 400 body message', async () => {
  global.fetch = async () => new Response(JSON.stringify({ message: 'baseUrl must be an https URL.' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
  await assert.rejects(runModelDiscovery(config), error => {
    assert.equal(error.message, 'baseUrl must be an https URL.');
    assert.equal(error.code, undefined);
    return true;
  });
});
