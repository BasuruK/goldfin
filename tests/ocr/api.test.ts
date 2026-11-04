import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { OcrError, submitOcr } from '../../src/lib/ocr/api.ts';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

afterEach(() => mock.restoreAll());

describe('submitOcr', () => {
  it('posts multipart fields to the OCR route', async () => {
    mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
      assert.equal(url, '/api/v1/probes/ocr');
      assert.equal(init?.method, 'POST');
      assert.ok(init.body instanceof FormData);
      const form = init.body;
      assert.equal(form.get('connectorId'), 'c1');
      assert.ok(form.get('document') instanceof File);
      return jsonResponse(200, { content: 'Hello', pages: 2 });
    });
    const file = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });
    const result = await submitOcr('c1', file);
    assert.deepEqual(result, { content: 'Hello', pages: 2 });
  });

  it('maps HTTP 408 and 504 to timeout through the shared request core', async () => {
    mock.method(globalThis, 'fetch', async () => jsonResponse(408, { message: 'internal detail' }));
    await assert.rejects(submitOcr('c1', new File(['x'], 'a.pdf')), error => {
      assert.ok(error instanceof OcrError);
      assert.equal(error.kind, 'timeout');
      assert.equal(error.message, 'OCR timed out.');
      return true;
    });
    mock.method(globalThis, 'fetch', async () => jsonResponse(504, { message: 'internal detail' }));
    await assert.rejects(submitOcr('c1', new File(['x'], 'a.pdf')), error => {
      assert.ok(error instanceof OcrError);
      assert.equal(error.kind, 'timeout');
      assert.equal(error.message, 'OCR timed out.');
      return true;
    });
  });

  it('maps caller abort to canceled through the shared request core', async () => {
    mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
      assert.ok(init?.signal instanceof AbortSignal);
      throw new DOMException('The operation was aborted.', 'AbortError');
    });
    await assert.rejects(
      submitOcr('c1', new File(['x'], 'a.pdf'), new AbortController().signal),
      error => {
        assert.ok(error instanceof OcrError);
        assert.equal(error.kind, 'canceled');
        assert.equal(error.message, 'OCR was canceled.');
        return true;
      }
    );
  });

  it('maps unavailable and unreachable failures distinctly', async () => {
    mock.method(globalThis, 'fetch', async () => jsonResponse(503, { message: 'raw db detail' }));
    await assert.rejects(submitOcr('c1', new File(['x'], 'a.pdf')), error => {
      assert.ok(error instanceof OcrError);
      assert.equal(error.kind, 'unavailable');
      assert.equal(error.message, 'Goldfin is unavailable right now. Try again.');
      return true;
    });
    mock.method(globalThis, 'fetch', async () => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(submitOcr('c1', new File(['x'], 'a.pdf')), error => {
      assert.ok(error instanceof OcrError);
      assert.equal(error.kind, 'unreachable');
      assert.equal(error.message, 'Could not reach the API. Check that Goldfin is running, then try again.');
      return true;
    });
  });

  it('gives the request the 5-minute Azure budget plus 35 s of server write headroom', async () => {
    const timeout = mock.method(AbortSignal, 'timeout');
    mock.method(globalThis, 'fetch', async () => jsonResponse(200, { content: 'Hello', pages: 1 }));
    await submitOcr('c1', new File(['x'], 'a.pdf'));
    assert.deepEqual(timeout.mock.calls.map(call => call.arguments), [[335_000]]);
  });

  it('maps a body without string content and numeric pages to malformed', async () => {
    for (const body of [null, { pages: 1 }, { content: 'Hello', pages: '2' }]) {
      mock.method(globalThis, 'fetch', async () => jsonResponse(200, body));
      await assert.rejects(
        submitOcr('c1', new File(['x'], 'a.pdf')),
        { name: 'OcrError', kind: 'malformed', message: 'Goldfin returned an unexpected response.' },
        JSON.stringify(body)
      );
    }
  });

  it('maps a status without a server message to its OCR message', async () => {
    const cases = [
      [500, 'unavailable', 'Goldfin is unavailable right now. Try again.'],
      [413, 'rejected', 'Request is too large.'],
      [400, 'rejected', 'Invalid OCR request.']
    ] as const;
    for (const [status, kind, message] of cases) {
      mock.method(globalThis, 'fetch', async () => jsonResponse(status, {}));
      await assert.rejects(submitOcr('c1', new File(['x'], 'a.pdf')), { name: 'OcrError', kind, message }, String(status));
    }
  });
});
