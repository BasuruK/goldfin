import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import {
  ApiError,
  appendPromptVersion,
  createPrompt,
  listPrompts,
  renamePrompt,
  validatePromptDraft
} from '../../src/lib/prompts/api.ts';

const VERSION = { id: 'v1', version: 1, content: 'Extract.', createdAt: '2026-01-01T00:00:00Z' };
const PROMPT = { id: 'p1', name: 'Invoices', createdAt: '2026-01-01T00:00:00Z', latestVersion: VERSION };

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

/** Replies once with `body`; the returned function reads back the request fetch received. */
function replyWith(status: number, body: unknown) {
  const fetchMock = mock.method(globalThis, 'fetch', async () => jsonResponse(status, body));
  return () => {
    const call = fetchMock.mock.calls[0];
    assert.ok(call, 'fetch was not called');
    const [url, init] = call.arguments as unknown as [string, RequestInit];
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    return { url, method: init.method ?? 'GET', body };
  };
}

function failWith(name: string) {
  mock.method(globalThis, 'fetch', async () => {
    throw Object.assign(new Error('transport'), { name });
  });
}

async function assertApiError(promise: Promise<unknown>, kind: string, message: string) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.kind, kind);
    assert.equal(error.message, message);
    return true;
  });
}

const MALFORMED = 'Goldfin returned an unexpected response.';

afterEach(() => mock.restoreAll());

describe('validatePromptDraft', () => {
  it('rejects a blank name and accepts a padded one', () => {
    assert.equal(validatePromptDraft('  ', 'body'), 'Enter a Prompt name before saving.');
    assert.equal(validatePromptDraft(' Invoices ', 'body'), null);
  });

  it('allows an 80-character name and rejects 81', () => {
    assert.equal(validatePromptDraft('a'.repeat(80), 'body'), null);
    assert.equal(validatePromptDraft('a'.repeat(81), 'body'), 'Prompt name must be 80 characters or fewer.');
  });

  it('allows 512 KiB of content and rejects one byte more', () => {
    assert.equal(validatePromptDraft('A', 'a'.repeat(512 * 1024)), null);
    assert.equal(validatePromptDraft('A', 'a'.repeat(512 * 1024 + 1)), 'Prompt content is too large.');
  });

  it('counts content in UTF-8 bytes, as the API does', () => {
    const half = 'é'.repeat(256 * 1024); // 2 bytes each: exactly 512 KiB
    assert.equal(validatePromptDraft('A', half), null);
    assert.equal(validatePromptDraft('A', `${half}a`), 'Prompt content is too large.');
  });
});

describe('createPrompt', () => {
  it('posts the trimmed name and content to /api/v1/prompts and returns the saved Prompt', async () => {
    const request = replyWith(201, PROMPT);
    assert.deepEqual(await createPrompt(' Invoices ', 'Extract.'), PROMPT);
    assert.deepEqual(request(), {
      url: '/api/v1/prompts',
      method: 'POST',
      body: { name: 'Invoices', content: 'Extract.' }
    });
  });

  it('rejects a reply that is not a Prompt', async () => {
    replyWith(201, { id: 'p1' });
    await assertApiError(createPrompt('A', 'b'), 'malformed', MALFORMED);
  });

  it('rejects a reply whose latestVersion is missing or mis-shaped', async () => {
    const broken = [
      undefined,
      'v1',
      { ...VERSION, id: 1 },
      { ...VERSION, version: '1' },
      { ...VERSION, content: null },
      { ...VERSION, createdAt: 0 }
    ];
    for (const latestVersion of broken) {
      replyWith(201, { ...PROMPT, latestVersion });
      await assertApiError(createPrompt('A', 'b'), 'malformed', MALFORMED);
      mock.restoreAll();
    }
  });
});

describe('appendPromptVersion', () => {
  it('posts only the content to the encoded versions path', async () => {
    const saved = { ...PROMPT, latestVersion: { ...VERSION, id: 'v2', version: 2, content: 'v2' } };
    const request = replyWith(201, saved);
    assert.deepEqual(await appendPromptVersion('a/b', 'v2'), saved);
    assert.deepEqual(request(), { url: '/api/v1/prompts/a%2Fb/versions', method: 'POST', body: { content: 'v2' } });
  });

  it('rejects a reply that is not a Prompt or has no latestVersion', async () => {
    for (const body of [{ id: 'p1' }, { ...PROMPT, latestVersion: undefined }]) {
      replyWith(201, body);
      await assertApiError(appendPromptVersion('p1', 'v2'), 'malformed', MALFORMED);
      mock.restoreAll();
    }
  });
});

describe('renamePrompt', () => {
  it('patches the trimmed name at the encoded Prompt path', async () => {
    const request = replyWith(200, { ...PROMPT, name: 'New' });
    assert.equal((await renamePrompt('a/b', ' New ')).name, 'New');
    assert.deepEqual(request(), { url: '/api/v1/prompts/a%2Fb', method: 'PATCH', body: { name: 'New' } });
  });

  it('rejects a reply that is not a Prompt', async () => {
    replyWith(200, { id: 'p1', createdAt: PROMPT.createdAt });
    await assertApiError(renamePrompt('p1', 'New'), 'malformed', MALFORMED);
  });
});

describe('listPrompts', () => {
  it('returns every listed Prompt, including one with no version yet', async () => {
    const bare = { id: 'p2', name: 'Bare', createdAt: PROMPT.createdAt };
    const request = replyWith(200, { prompts: [PROMPT, bare] });
    const [first, second] = await listPrompts();
    assert.deepEqual(first, PROMPT);
    assert.ok(second);
    assert.equal(second.id, 'p2');
    assert.equal(second.latestVersion, undefined);
    assert.deepEqual(request(), { url: '/api/v1/prompts', method: 'GET', body: undefined });
  });

  it('rejects a body without a prompts array', async () => {
    for (const body of [{}, { prompts: 'x' }, null, 'text', new SyntaxError('not json')]) {
      replyWith(200, body);
      await assertApiError(listPrompts(), 'malformed', MALFORMED);
      mock.restoreAll();
    }
  });

  it('rejects the list when any entry is not a Prompt', async () => {
    const broken = [
      null,
      [],
      'p1',
      { ...PROMPT, id: 1 },
      { ...PROMPT, name: 2 },
      { ...PROMPT, createdAt: 3 }
    ];
    for (const entry of broken) {
      replyWith(200, { prompts: [PROMPT, entry] });
      await assertApiError(listPrompts(), 'malformed', MALFORMED);
      mock.restoreAll();
    }
  });
});

describe('request failures', () => {
  it('shows the server message for a 400 and the Prompt fallback when it has none', async () => {
    replyWith(400, { message: 'Invalid Prompt.' });
    await assertApiError(createPrompt('A', 'b'), 'rejected', 'Invalid Prompt.');
    mock.restoreAll();
    replyWith(400, {});
    await assertApiError(createPrompt('A', 'b'), 'rejected', 'The Prompt was rejected.');
  });

  it('maps a 5xx, a network failure and a timeout to distinct messages', async () => {
    replyWith(503, { message: 'pool exhausted' });
    await assertApiError(listPrompts(), 'unavailable', 'Goldfin is unavailable right now. Try again.');
    mock.restoreAll();
    failWith('TypeError');
    await assertApiError(
      listPrompts(),
      'unreachable',
      'Could not reach the API. Check that Goldfin is running, then try again.'
    );
    mock.restoreAll();
    failWith('TimeoutError');
    await assertApiError(listPrompts(), 'timeout', 'The request timed out. Try again.');
  });
});
