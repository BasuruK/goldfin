import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  ApiError,
  PROMPTS_PATH,
  appendPromptVersion,
  createPrompt,
  listPrompts,
  renamePrompt,
  validatePromptDraft
} from '../../src/lib/prompts/api.ts';

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

afterEach(() => mock.restoreAll());

describe('validatePromptDraft', () => {
  it('requires a trimmed name', () => {
    assert.equal(validatePromptDraft('  ', 'body'), 'Enter a Prompt name before saving.');
    assert.equal(validatePromptDraft('Invoices', 'body'), null);
  });
});

describe('createPrompt', () => {
  it('posts trimmed name and content', async () => {
    const saved = {
      id: 'p1',
      name: 'Invoices',
      createdAt: '2026-01-01T00:00:00Z',
      latestVersion: { id: 'v1', version: 1, content: 'Extract.', createdAt: '2026-01-01T00:00:00Z' }
    };
    const fetchMock = mockFetch(async () => jsonResponse(201, saved));
    assert.deepEqual(await createPrompt(' Invoices ', 'Extract.'), saved);
    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, PROMPTS_PATH);
    assert.deepEqual(JSON.parse(String(init?.body)), { name: 'Invoices', content: 'Extract.' });
  });
});

describe('appendPromptVersion', () => {
  it('posts content to the versions path', async () => {
    const saved = {
      id: 'p1',
      name: 'Invoices',
      createdAt: '2026-01-01T00:00:00Z',
      latestVersion: { id: 'v2', version: 2, content: 'v2', createdAt: '2026-01-02T00:00:00Z' }
    };
    const fetchMock = mockFetch(async () => jsonResponse(201, saved));
    await appendPromptVersion('p1', 'v2');
    const [url] = fetchMock.mock.calls[0].arguments as [string];
    assert.equal(url, `${PROMPTS_PATH}/p1/versions`);
  });
});

describe('listPrompts', () => {
  it('maps the prompts array', async () => {
    mockFetch(async () =>
      jsonResponse(200, {
        prompts: [
          {
            id: 'p1',
            name: 'A',
            createdAt: '2026-01-01T00:00:00Z',
            latestVersion: { id: 'v1', version: 1, content: 'x', createdAt: '2026-01-01T00:00:00Z' }
          }
        ]
      })
    );
    const list = await listPrompts();
    assert.equal(list.length, 1);
    assert.equal(list[0].latestVersion?.version, 1);
  });
});

describe('renamePrompt', () => {
  it('patches the prompt name', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse(200, {
        id: 'p1',
        name: 'New',
        createdAt: '2026-01-01T00:00:00Z',
        latestVersion: { id: 'v1', version: 1, content: 'x', createdAt: '2026-01-01T00:00:00Z' }
      })
    );
    await renamePrompt('p1', ' New ');
    const init = fetchMock.mock.calls[0].arguments[1] as RequestInit;
    assert.equal(init.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(init.body)), { name: 'New' });
  });
});

describe('ApiError', () => {
  it('maps a 400 to rejected', async () => {
    mockFetch(async () => jsonResponse(400, { message: 'Invalid Prompt.' }));
    await assert.rejects(createPrompt('A', 'b'), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, 'rejected');
      return true;
    });
  });
});
