import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  ApiError,
  CONNECTORS_PATH,
  createConnector,
  listConnectors,
  validateDraft
} from '../../src/lib/connectors/api.js';

/** @param {number} status @param {unknown} body */
function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    }
  };
}

/** @param {(url: string, init?: RequestInit) => Promise<unknown>} impl */
function mockFetch(impl) {
  mock.method(globalThis, 'fetch', impl);
  return /** @type {import('node:test').Mock<(...args: any[]) => any>} */ (/** @type {unknown} */ (globalThis.fetch));
}

/** @param {Promise<unknown>} promise @param {string} kind */
async function rejectsWith(promise, kind) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.kind, kind);
    return true;
  });
}

const draft = {
  name: 'Gateway',
  providerType: 'web_request',
  baseUrl: 'https://example.com/extract',
  credential: '',
  credentialLabel: ''
};

const saved = { id: 'c1', name: 'Gateway', providerType: 'web_request', baseUrl: 'https://example.com/extract' };

afterEach(() => mock.restoreAll());

describe('createConnector', () => {
  it('posts only the API fields, omits an absent Credential, and returns the saved Connector', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(201, saved));
    assert.deepEqual(await createConnector({ ...draft, name: ' Gateway ' }), saved);
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, CONNECTORS_PATH);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      name: 'Gateway',
      providerType: 'web_request',
      baseUrl: 'https://example.com/extract'
    });
    assert.ok(init?.signal instanceof AbortSignal);
  });

  it('omits apiVersion for web_request even when a draft still carries one', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(201, saved));
    await createConnector({ ...draft, apiVersion: '2024-11-30' });
    const body = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body));
    assert.equal(body.apiVersion, undefined);
  });

  it('sends Credential bytes untouched with their trimmed label', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(201, { ...saved, credentialLabel: 'Prod key' }));
    await createConnector({ ...draft, credential: ' tok en ', credentialLabel: ' Prod key ' });
    const body = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body));
    assert.equal(body.credential, ' tok en ');
    assert.equal(body.credentialLabel, 'Prod key');
  });

  it('maps a 400 to the safe server message', async () => {
    mockFetch(async () => jsonResponse(400, { message: 'Invalid Connector.' }));
    await assert.rejects(createConnector(draft), { name: 'ApiError', kind: 'rejected', message: 'Invalid Connector.' });
  });

  it('maps a 503 to unavailable without echoing the body', async () => {
    mockFetch(async () => jsonResponse(503, { message: 'raw db detail' }));
    await assert.rejects(createConnector(draft), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, 'unavailable');
      assert.doesNotMatch(error.message, /raw db detail/);
      return true;
    });
  });

  it('maps malformed or mis-shaped success bodies to malformed', async () => {
    mockFetch(async () => jsonResponse(201, new Error('not json')));
    await rejectsWith(createConnector(draft), 'malformed');
    mockFetch(async () => jsonResponse(201, { id: 7 }));
    await rejectsWith(createConnector(draft), 'malformed');
  });

  it('maps a network failure to unreachable and a timeout to timeout', async () => {
    mockFetch(async () => { throw new TypeError('fetch failed'); });
    await rejectsWith(createConnector(draft), 'unreachable');
    mockFetch(async () => { throw new DOMException('timed out', 'TimeoutError'); });
    await rejectsWith(createConnector(draft), 'timeout');
  });
});

describe('listConnectors', () => {
  it('returns the listed Connectors and rejects a body without a list', async () => {
    mockFetch(async () => jsonResponse(200, { connectors: [saved] }));
    assert.deepEqual(await listConnectors(), [saved]);
    mockFetch(async () => jsonResponse(200, { connectors: null }));
    await rejectsWith(listConnectors(), 'malformed');
  });
});

describe('validateDraft', () => {
  it('requires a name and a valid http(s) base URL', () => {
    assert.deepEqual(validateDraft({ ...draft, name: ' ' }), { field: 'name', message: 'Name is required.' });
    assert.deepEqual(validateDraft({ ...draft, baseUrl: '' }), { field: 'baseUrl', message: 'Base URL is required.' });
    assert.deepEqual(validateDraft({ ...draft, baseUrl: 'ftp://x' }), { field: 'baseUrl', message: 'Enter a valid http(s) URL.' });
    assert.equal(validateDraft(draft), null);
  });

  it('requires a Credential and label for Azure Document Intelligence', () => {
    const azure = {
      ...draft,
      providerType: 'azure_document_intelligence',
      baseUrl: 'https://ocr.example.cognitiveservices.azure.com'
    };
    assert.deepEqual(validateDraft(azure), {
      field: 'credential',
      message: 'API Key is required for Azure Document Intelligence.'
    });
    assert.deepEqual(
      validateDraft({ ...azure, credential: 'key' }),
      { field: 'credentialLabel', message: 'A label is required when a Credential is set.' }
    );
    assert.equal(validateDraft({ ...azure, credential: 'key', credentialLabel: 'Prod' }), null);
  });

  it('requires a label exactly when a Credential is supplied', () => {
    assert.deepEqual(
      validateDraft({ ...draft, credential: 'secret' }),
      { field: 'credentialLabel', message: 'A label is required when a Credential is set.' }
    );
    assert.equal(validateDraft({ ...draft, credential: 'secret', credentialLabel: 'Prod' }), null);
  });

  it('rejects control characters in the Credential before they reach a header', () => {
    for (const credential of ['tok\r\nen', 'tok\u0000en', 'tok\u0085en', 'tok\ten']) {
      assert.deepEqual(
        validateDraft({ ...draft, credential, credentialLabel: 'Prod' }),
        { field: 'credential', message: 'Remove control characters from the API Key.' },
        JSON.stringify(credential)
      );
    }
    assert.equal(validateDraft({ ...draft, credential: 'tok en-._~', credentialLabel: 'Prod' }), null);
  });

  it('mirrors the API URL rules so rejection is field-level, not opaque', () => {
    assert.deepEqual(
      validateDraft({ ...draft, baseUrl: 'https://user:token@example.com/x' }),
      { field: 'baseUrl', message: 'Remove the username or password from the URL.' }
    );
    assert.deepEqual(
      validateDraft({ ...draft, baseUrl: 'https://example.com/x#frag' }),
      { field: 'baseUrl', message: 'Remove the # fragment from the URL.' }
    );
    assert.deepEqual(
      validateDraft({ ...draft, baseUrl: 'http://example.com/x', credential: 'secret', credentialLabel: 'Prod' }),
      { field: 'baseUrl', message: 'Use https when a Credential is set.' }
    );
    for (const key of ['api_key', 'Token', 'X-Amz-Signature', 'subscription-key']) {
      assert.deepEqual(
        validateDraft({ ...draft, baseUrl: `https://example.com/x?${key}=v` }),
        { field: 'baseUrl', message: 'Remove secret query parameters from the URL.' },
        key
      );
    }
    assert.equal(
      validateDraft({ ...draft, baseUrl: 'https://example.com/x?sig2=v&page=1', credential: 'secret', credentialLabel: 'Prod' }),
      null
    );
  });
});
