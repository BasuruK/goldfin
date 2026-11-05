import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { fetchApiRequest, isJsonRecord, requestJson } from '../src/lib/request-core.ts';

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

function respond(status: number, body: unknown) {
  mock.method(globalThis, 'fetch', async () => jsonResponse(status, body));
}

function fail(error: Error) {
  mock.method(globalThis, 'fetch', async () => {
    throw error;
  });
}

afterEach(() => mock.restoreAll());

describe('requestJson', () => {
  it('returns a JSON object and refuses any other success body as malformed', async () => {
    respond(200, { ok: true });
    assert.deepEqual(await requestJson('/x', 'Rejected.'), { ok: true });
    for (const body of ['text', 7, [1], null, new Error('not json')]) {
      respond(200, body);
      await assert.rejects(
        requestJson('/x', 'Rejected.'),
        { name: 'ApiError', kind: 'malformed', message: 'Goldfin returned an unexpected response.' },
        String(body)
      );
    }
  });

  it('maps a 4xx to the server message, or the caller message when there is none', async () => {
    respond(400, { message: 'Name is taken.' });
    await assert.rejects(requestJson('/x', 'Rejected.'), { kind: 'rejected', message: 'Name is taken.' });
    for (const body of [{}, { message: 7 }, new Error('not json')]) {
      respond(422, body);
      await assert.rejects(requestJson('/x', 'Rejected.'), { kind: 'rejected', message: 'Rejected.' }, JSON.stringify(body));
    }
  });

  it('maps every status from 500 up to unavailable without the server message', async () => {
    for (const status of [500, 503]) {
      respond(status, { message: 'raw db detail' });
      await assert.rejects(
        requestJson('/x', 'Rejected.'),
        { kind: 'unavailable', message: 'Goldfin is unavailable right now. Try again.' },
        String(status)
      );
    }
  });

  it('maps an abort to unreachable, because requestJson maps no cancel', async () => {
    fail(new DOMException('The operation was aborted.', 'AbortError'));
    await assert.rejects(requestJson('/x', 'Rejected.'), {
      name: 'ApiError',
      kind: 'unreachable',
      message: 'Could not reach the API. Check that Goldfin is running, then try again.'
    });
  });
});

describe('fetchApiRequest', () => {
  const messages = { timeout: 'Timed out.', unreachable: 'Unreachable.', rejected: 'Rejected.', unavailable: 'Unavailable.' };
  const options = {
    path: '/x',
    init: {},
    timeoutMs: 1000,
    messages,
    createError: (kind: string, message: string) => Object.assign(new Error(message), { kind })
  };

  it('aborts the request when the caller aborts', async () => {
    const caller = new AbortController();
    mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
      assert.ok(init?.signal);
      assert.equal(init.signal.aborted, false);
      caller.abort();
      assert.equal(init.signal.aborted, true);
      return jsonResponse(200, {});
    });
    await fetchApiRequest({ ...options, callerSignal: caller.signal });
  });

  it('maps a caller cancel to the cancel kind it was given', async () => {
    fail(new DOMException('The operation was aborted.', 'AbortError'));
    await assert.rejects(fetchApiRequest({ ...options, canceledKind: 'canceled', canceledMessage: 'Canceled.' }), {
      kind: 'canceled',
      message: 'Canceled.'
    });
  });

  it('maps 408 and 504 to timeout only when the caller opts in', async () => {
    for (const status of [408, 504]) {
      respond(status, {});
      await assert.rejects(fetchApiRequest({ ...options, httpTimeoutStatuses: true }), { kind: 'timeout', message: 'Timed out.' });
      respond(status, {});
      await assert.rejects(fetchApiRequest(options), { kind: status === 408 ? 'rejected' : 'unavailable' });
    }
  });

  it('uses the caller status message over the default, but not over a server rejection message', async () => {
    const statusMessage = (status: number) => `Status ${status}.`;
    respond(503, {});
    await assert.rejects(fetchApiRequest({ ...options, statusMessage }), { kind: 'unavailable', message: 'Status 503.' });
    respond(413, {});
    await assert.rejects(fetchApiRequest({ ...options, statusMessage }), { kind: 'rejected', message: 'Status 413.' });
    respond(413, { message: 'Too big.' });
    await assert.rejects(fetchApiRequest({ ...options, statusMessage }), { kind: 'rejected', message: 'Too big.' });
  });
});

describe('isJsonRecord', () => {
  it('accepts only a non-null, non-array object', () => {
    assert.equal(isJsonRecord({}), true);
    for (const value of [null, [], 'text', 7, true, undefined]) {
      assert.equal(isJsonRecord(value), false, String(value));
    }
  });
});
