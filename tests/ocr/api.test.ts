import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { OcrError, OCR_PATH, submitOcr } from '../../src/lib/ocr/api.ts';

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
      assert.equal(url, OCR_PATH);
      assert.equal(init?.method, 'POST');
      assert.ok(init?.body instanceof FormData);
      const form = init.body as FormData;
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
      return true;
    });
  });
});
