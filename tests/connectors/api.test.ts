import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { ApiError } from '../../src/lib/request-core.ts';
import {
  createConnector,
  listConnectors,
  validateDraft
} from '../../src/lib/connectors/api.ts';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    }
  };
}

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<unknown>) {
  mock.method(globalThis, 'fetch', impl);
  return globalThis.fetch as typeof fetch & { mock: { calls: { arguments: unknown[] }[] } };
}

function firstRequest(fetchMock: ReturnType<typeof mockFetch>): [string, RequestInit] {
  const call = fetchMock.mock.calls[0];
  assert.ok(call, 'fetch was not called');
  return call.arguments as [string, RequestInit];
}

/** The JSON the first request sent, parsed as the API would read it. */
function sentBody(fetchMock: ReturnType<typeof mockFetch>): unknown {
  const [, init] = firstRequest(fetchMock);
  assert.ok(typeof init.body === 'string', 'request body is not a JSON string');
  return JSON.parse(init.body);
}

async function rejectsWith(promise: Promise<unknown>, kind: ApiError['kind']) {
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

const sentFields = { name: 'Gateway', providerType: 'web_request', baseUrl: 'https://example.com/extract' };

const saved = { id: 'c1', name: 'Gateway', providerType: 'web_request', baseUrl: 'https://example.com/extract' };

afterEach(() => mock.restoreAll());

describe('createConnector', () => {
  it('posts only the API fields, omits an absent Credential, and returns the saved Connector', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(201, saved));
    assert.deepEqual(await createConnector({ ...draft, name: ' Gateway ', baseUrl: ' https://example.com/extract ' }), saved);
    const [url, init] = firstRequest(fetchMock);
    assert.equal(url, '/api/v1/connectors');
    assert.equal(init.method, 'POST');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(sentBody(fetchMock), sentFields);
    assert.ok(init.signal instanceof AbortSignal);
  });

  it('omits apiVersion for web_request even when a draft still carries one', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(201, saved));
    await createConnector({ ...draft, apiVersion: '2024-11-30' });
    assert.deepEqual(sentBody(fetchMock), sentFields);
  });

  it('sends a trimmed apiVersion for Azure OCR and omits a blank or absent one', async () => {
    const azure = { ...draft, providerType: 'azure_document_intelligence' };
    const azureFields = { ...sentFields, providerType: 'azure_document_intelligence' };
    let fetchMock = mockFetch(async () => jsonResponse(201, saved));
    await createConnector({ ...azure, apiVersion: ' 2024-11-30 ' });
    assert.deepEqual(sentBody(fetchMock), { ...azureFields, apiVersion: '2024-11-30' });
    for (const apiVersion of [' ', undefined]) {
      mock.restoreAll();
      fetchMock = mockFetch(async () => jsonResponse(201, saved));
      await createConnector({ ...azure, apiVersion });
      assert.deepEqual(sentBody(fetchMock), azureFields, String(apiVersion));
    }
  });

  it('sends the LLM API mode and each model as { id, enabled }, and omits an empty model list', async () => {
    const llm = { ...draft, providerType: 'openai', llmApiMode: 'responses' };
    const llmFields = { ...sentFields, providerType: 'openai', llmApiMode: 'responses' };
    let fetchMock = mockFetch(async () => jsonResponse(201, saved));
    await createConnector({ ...llm, models: [{ id: 'model-a', enabled: true }, { id: 'model-b', enabled: false }] });
    assert.deepEqual(sentBody(fetchMock), {
      ...llmFields,
      models: [{ id: 'model-a', enabled: true }, { id: 'model-b', enabled: false }]
    });
    mock.restoreAll();
    fetchMock = mockFetch(async () => jsonResponse(201, saved));
    await createConnector({ ...llm, models: [] });
    assert.deepEqual(sentBody(fetchMock), llmFields);
  });

  it('sends Credential bytes untouched with their trimmed label', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(201, { ...saved, credentialLabel: 'Prod key' }));
    await createConnector({ ...draft, credential: ' tok en ', credentialLabel: ' Prod key ' });
    assert.deepEqual(sentBody(fetchMock), { ...sentFields, credential: ' tok en ', credentialLabel: 'Prod key' });
  });

  it('maps a 400 to the safe server message', async () => {
    mockFetch(async () => jsonResponse(400, { message: 'Invalid Connector.' }));
    await assert.rejects(createConnector(draft), { name: 'ApiError', kind: 'rejected', message: 'Invalid Connector.' });
  });

  it('maps a 4xx without a server message to the Connector rejection message', async () => {
    mockFetch(async () => jsonResponse(422, {}));
    await assert.rejects(createConnector(draft), { name: 'ApiError', kind: 'rejected', message: 'The Connector was rejected.' });
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
    mockFetch(async () => jsonResponse(201, { id: 'c1', name: 'Gateway', providerType: 'web_request' }));
    await rejectsWith(createConnector(draft), 'malformed');
  });

  it('maps a network failure to unreachable and a timeout to timeout', async () => {
    mockFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await rejectsWith(createConnector(draft), 'unreachable');
    mockFetch(async () => {
      throw new DOMException('timed out', 'TimeoutError');
    });
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

  it('rejects a list entry missing required Connector fields', async () => {
    mockFetch(async () => jsonResponse(200, { connectors: [{ id: 'c1' }] }));
    await rejectsWith(listConnectors(), 'malformed');
    mockFetch(async () => jsonResponse(200, { connectors: [saved, 'not-a-record'] }));
    await rejectsWith(listConnectors(), 'malformed');
    mockFetch(async () => jsonResponse(200, { connectors: [null] }));
    await rejectsWith(listConnectors(), 'malformed');
    mockFetch(async () => jsonResponse(200, { connectors: [{ ...saved, id: '' }] }));
    await rejectsWith(listConnectors(), 'malformed');
  });

  it('keeps every optional field the API sends, and only id and enabled from each model', async () => {
    const full = {
      ...saved,
      apiVersion: '2024-11-30',
      llmApiMode: 'responses',
      credentialLabel: 'Prod',
      credentialSetAt: '2026-01-01T00:00:00Z'
    };
    mockFetch(async () => jsonResponse(200, { connectors: [{ ...full, models: [{ id: 'model-a', enabled: true, source: 'x' }] }] }));
    assert.deepEqual(await listConnectors(), [{ ...full, models: [{ id: 'model-a', enabled: true }] }]);
  });

  it('reads a null or absent model list as no models', async () => {
    mockFetch(async () => jsonResponse(200, { connectors: [{ ...saved, models: null }, saved] }));
    assert.deepEqual(await listConnectors(), [saved, saved]);
  });

  it('rejects a mis-typed optional field, model list or model entry', async () => {
    const bad = [
      { apiVersion: 7 },
      { models: 'model-a' },
      { models: ['model-a'] },
      { models: [{ id: 7, enabled: true }] },
      { models: [{ id: 'model-a', enabled: 'yes' }] }
    ];
    for (const fields of bad) {
      mockFetch(async () => jsonResponse(200, { connectors: [{ ...saved, ...fields }] }));
      await rejectsWith(listConnectors(), 'malformed');
      mock.restoreAll();
    }
  });
});

describe('validateDraft', () => {
  it('requires a name and a valid http(s) base URL', () => {
    assert.deepEqual(validateDraft({ ...draft, name: ' ' }), { field: 'name', message: 'Name is required.' });
    assert.deepEqual(validateDraft({ ...draft, baseUrl: ' ' }), { field: 'baseUrl', message: 'Base URL is required.' });
    assert.deepEqual(validateDraft({ ...draft, baseUrl: 'ftp://x' }), { field: 'baseUrl', message: 'Enter a valid http(s) URL.' });
    assert.equal(validateDraft(draft), null);
    assert.equal(validateDraft({ ...draft, baseUrl: 'http://example.com/x' }), null);
  });

  it('requires a Credential and label for Azure Document Intelligence', () => {
    const azure = {
      ...draft,
      providerType: 'azure_document_intelligence',
      baseUrl: 'https://ocr.example.cognitiveservices.azure.com'
    };
    assert.deepEqual(validateDraft({ ...azure, credential: ' ' }), {
      field: 'credential',
      message: 'API Key is required for Azure Document Intelligence.'
    });
    assert.deepEqual(
      validateDraft({ ...azure, credential: 'key' }),
      { field: 'credentialLabel', message: 'A label is required when a Credential is set.' }
    );
    assert.equal(validateDraft({ ...azure, credential: 'key', credentialLabel: 'Prod' }), null);
  });

  it('requires a Credential for OpenAI and OpenAI-compatible providers', () => {
    for (const providerType of ['openai', 'openai_compatible']) {
      assert.deepEqual(
        validateDraft({ ...draft, providerType }),
        { field: 'credential', message: 'API Key is required for this provider.' },
        providerType
      );
    }
  });

  it('requires a label exactly when a Credential is supplied', () => {
    assert.deepEqual(
      validateDraft({ ...draft, credential: 'secret', credentialLabel: ' ' }),
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
    for (const baseUrl of ['https://user:token@example.com/x', 'https://user@example.com/x']) {
      assert.deepEqual(
        validateDraft({ ...draft, baseUrl }),
        { field: 'baseUrl', message: 'Remove the username or password from the URL.' },
        baseUrl
      );
    }
    assert.deepEqual(
      validateDraft({ ...draft, baseUrl: 'https://example.com/x#frag' }),
      { field: 'baseUrl', message: 'Remove the # fragment from the URL.' }
    );
    assert.deepEqual(
      validateDraft({ ...draft, baseUrl: 'http://example.com/x', credential: 'secret', credentialLabel: 'Prod' }),
      { field: 'baseUrl', message: 'Use https when a Credential is set.' }
    );
    for (const key of ['api_key', 'Token', 'access_token', 'sig', 'key', 'subscription-key', 'X-Amz-Signature']) {
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
