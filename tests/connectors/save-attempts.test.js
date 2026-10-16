import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  CONNECTORS_PATH,
  SAVE_ATTEMPTS_PATH,
  SaveAttemptError,
  createSaveAttempt,
  getSaveAttempt,
  listConnectors,
  pollSaveAttempt,
  validateSaveDraft
} from '../../src/lib/connectors/save-attempts.js';

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

const draft = {
  name: 'Gateway',
  providerType: 'web_request',
  baseUrl: 'https://example.com/extract',
  credential: '',
  credentialLabel: ''
};

describe('createSaveAttempt', () => {
  it('posts only the API fields and omits an absent Credential', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(202, { id: 'a1', state: 'queued' }));
    const attempt = await createSaveAttempt(draft);
    assert.deepEqual(attempt, { id: 'a1', state: 'queued' });
    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, SAVE_ATTEMPTS_PATH);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      name: 'Gateway',
      providerType: 'web_request',
      baseUrl: 'https://example.com/extract'
    });
    assert.ok(init?.signal instanceof AbortSignal);
    mock.restoreAll();
  });

  it('sends Credential bytes untouched with their label', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(202, { id: 'a2', state: 'queued' }));
    await createSaveAttempt({ ...draft, credential: ' tok en ', credentialLabel: ' Prod key ' });
    const body = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body));
    assert.equal(body.credential, ' tok en ');
    assert.equal(body.credentialLabel, 'Prod key');
    mock.restoreAll();
  });

  it('maps a 400 to the safe server message', async () => {
    mockFetch(async () => jsonResponse(400, { message: 'Invalid Save proposal.' }));
    await assert.rejects(createSaveAttempt(draft), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'rejected');
      assert.equal(error.message, 'Invalid Save proposal.');
      return true;
    });
    mock.restoreAll();
  });

  it('maps a 503 to unavailable without echoing the body', async () => {
    mockFetch(async () => jsonResponse(503, { message: 'raw db detail' }));
    await assert.rejects(createSaveAttempt(draft), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'unavailable');
      assert.doesNotMatch(error.message, /raw db detail/);
      return true;
    });
    mock.restoreAll();
  });

  it('maps malformed success JSON to malformed', async () => {
    mockFetch(async () => jsonResponse(202, new Error('not json')));
    await assert.rejects(createSaveAttempt(draft), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'malformed');
      return true;
    });
    mock.restoreAll();
  });

  it('rejects a success body with the wrong shape', async () => {
    mockFetch(async () => jsonResponse(202, { id: 7, state: 'queued' }));
    await assert.rejects(createSaveAttempt(draft), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'malformed');
      return true;
    });
    mock.restoreAll();
  });

  it('maps a network failure to unreachable and a timeout to timeout', async () => {
    mockFetch(async () => { throw new TypeError('fetch failed'); });
    await assert.rejects(createSaveAttempt(draft), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'unreachable');
      return true;
    });
    mockFetch(async () => { throw new DOMException('timed out', 'TimeoutError'); });
    await assert.rejects(createSaveAttempt(draft), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'timeout');
      return true;
    });
    mock.restoreAll();
  });
});

describe('getSaveAttempt', () => {
  it('returns a finished attempt with finding and connector id', async () => {
    mockFetch(async () => jsonResponse(200, {
      id: 'a1', state: 'finished', connectorId: 'c1',
      finding: { kind: 'reachable', httpStatus: 200, latencyMs: 42 }
    }));
    const attempt = await getSaveAttempt('a1');
    assert.deepEqual(attempt, {
      id: 'a1', state: 'finished', connectorId: 'c1',
      finding: { kind: 'reachable', httpStatus: 200, latencyMs: 42 }
    });
    mock.restoreAll();
  });

  it('rejects an unknown state', async () => {
    mockFetch(async () => jsonResponse(200, { id: 'a1', state: 'vanished' }));
    await assert.rejects(getSaveAttempt('a1'), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'malformed');
      return true;
    });
    mock.restoreAll();
  });

  it('rejects a non-string state without coercion', async () => {
    mockFetch(async () => jsonResponse(200, { id: 'a1', state: ['queued'] }));
    await assert.rejects(getSaveAttempt('a1'), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'malformed');
      return true;
    });
    mock.restoreAll();
  });
});

describe('listConnectors', () => {
  it('returns an empty list and validated metadata', async () => {
    mockFetch(async () => jsonResponse(200, { connectors: [] }));
    assert.deepEqual(await listConnectors(), []);
    mockFetch(async () => jsonResponse(200, {
      connectors: [{ id: 'c1', name: 'GW', providerType: 'web_request', baseUrl: 'https://example.com', credentialLabel: 'Prod' }]
    }));
    assert.deepEqual(await listConnectors(), [
      { id: 'c1', name: 'GW', providerType: 'web_request', baseUrl: 'https://example.com', credentialLabel: 'Prod' }
    ]);
    mock.restoreAll();
  });

  it('rejects a malformed list', async () => {
    mockFetch(async () => jsonResponse(200, { connectors: [{ id: 'c1' }] }));
    await assert.rejects(listConnectors(), (error) => {
      assert.ok(error instanceof SaveAttemptError);
      assert.equal(error.kind, 'malformed');
      return true;
    });
    mock.restoreAll();
  });
});

describe('pollSaveAttempt', () => {
  it('reports queued and running, then resolves finished', async () => {
    const states = [
      { id: 'a1', state: 'queued' },
      { id: 'a1', state: 'running' },
      { id: 'a1', state: 'finished', failureCode: 'unreachable' }
    ];
    mockFetch(async () => jsonResponse(200, states.shift()));
    /** @type {string[]} */
    const seen = [];
    const final = await pollSaveAttempt('a1', {
      intervalMs: 1,
      deadlineMs: 5_000,
      onUpdate: attempt => seen.push(attempt.state)
    });
    assert.deepEqual(seen, ['queued', 'running', 'finished']);
    assert.equal(final.failureCode, 'unreachable');
    mock.restoreAll();
  });

  it('times out at the overall deadline', async () => {
    mockFetch(async () => jsonResponse(200, { id: 'a1', state: 'running' }));
    await assert.rejects(
      pollSaveAttempt('a1', { intervalMs: 1, deadlineMs: 20 }),
      (error) => {
        assert.ok(error instanceof SaveAttemptError);
        assert.equal(error.kind, 'timeout');
        return true;
      }
    );
    mock.restoreAll();
  });

  it('bounds an in-flight poll by the remaining deadline, not the request timeout', async () => {
    mockFetch(async (/** @type {string} */ _url, /** @type {RequestInit | undefined} */ init) => {
      const signal = init?.signal;
      await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError')));
      });
    });
    const started = Date.now();
    await assert.rejects(
      pollSaveAttempt('a1', { intervalMs: 1, deadlineMs: 30 }),
      (error) => {
        assert.ok(error instanceof SaveAttemptError);
        assert.equal(error.kind, 'timeout');
        return true;
      }
    );
    assert.ok(Date.now() - started < 2_000, 'poll must not wait out the 10s request timeout');
    mock.restoreAll();
  });

  it('stops when the caller aborts', async () => {
    mockFetch(async () => jsonResponse(200, { id: 'a1', state: 'running' }));
    const controller = new AbortController();
    const polling = pollSaveAttempt('a1', { intervalMs: 1, deadlineMs: 5_000, signal: controller.signal });
    controller.abort();
    await assert.rejects(polling, (error) => {
      assert.equal(/** @type {Error} */ (error).name, 'AbortError');
      return true;
    });
    mock.restoreAll();
  });
});

describe('validateSaveDraft', () => {
  it('requires a name and a valid http(s) base URL', () => {
    assert.deepEqual(validateSaveDraft({ ...draft, name: ' ' }), { field: 'name', message: 'Name is required.' });
    assert.deepEqual(validateSaveDraft({ ...draft, baseUrl: '' }), { field: 'baseUrl', message: 'Base URL is required.' });
    assert.deepEqual(validateSaveDraft({ ...draft, baseUrl: 'ftp://x' }), { field: 'baseUrl', message: 'Enter a valid http(s) URL.' });
    assert.equal(validateSaveDraft(draft), null);
  });

  it('requires a label exactly when a Credential is supplied', () => {
    assert.deepEqual(
      validateSaveDraft({ ...draft, credential: 'secret' }),
      { field: 'credentialLabel', message: 'A label is required when a Credential is set.' }
    );
    assert.equal(validateSaveDraft({ ...draft, credential: 'secret', credentialLabel: 'Prod' }), null);
  });

  it('rejects control characters in the Credential before they reach a header', () => {
    for (const credential of ['tok\r\nen', 'tok\u0000en', 'tok\u0085en', 'tok\ten']) {
      assert.deepEqual(
        validateSaveDraft({ ...draft, credential, credentialLabel: 'Prod' }),
        { field: 'credential', message: 'Remove control characters from the API Key.' },
        JSON.stringify(credential)
      );
    }
    assert.equal(validateSaveDraft({ ...draft, credential: 'tok en-._~', credentialLabel: 'Prod' }), null);
  });

  it('mirrors the API URL rules so rejection is field-level, not opaque', () => {
    assert.deepEqual(
      validateSaveDraft({ ...draft, baseUrl: 'https://user:token@example.com/x' }),
      { field: 'baseUrl', message: 'Remove the username or password from the URL.' }
    );
    assert.deepEqual(
      validateSaveDraft({ ...draft, baseUrl: 'https://example.com/x#frag' }),
      { field: 'baseUrl', message: 'Remove the # fragment from the URL.' }
    );
    assert.deepEqual(
      validateSaveDraft({ ...draft, baseUrl: 'http://example.com/x', credential: 'secret', credentialLabel: 'Prod' }),
      { field: 'baseUrl', message: 'Use https when a Credential is set.' }
    );
    for (const key of ['api_key', 'Token', 'X-Amz-Signature', 'subscription-key']) {
      assert.deepEqual(
        validateSaveDraft({ ...draft, baseUrl: `https://example.com/x?${key}=v` }),
        { field: 'baseUrl', message: 'Remove secret query parameters from the URL.' },
        key
      );
    }
    assert.equal(
      validateSaveDraft({ ...draft, baseUrl: 'https://example.com/x?sig2=v&page=1', credential: 'secret', credentialLabel: 'Prod' }),
      null
    );
  });
});
