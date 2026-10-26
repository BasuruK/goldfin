import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { OcrError, OCR_PATH, submitOcr } from '../../src/lib/ocr/api.js';

/** @param {number} status @param {unknown} body */
function jsonResponse(status, body) {
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
    mock.method(globalThis, 'fetch', async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
      assert.equal(url, OCR_PATH);
      assert.equal(init?.method, 'POST');
      assert.ok(init?.body instanceof FormData);
      const form = /** @type {FormData} */ (init.body);
      assert.equal(form.get('connectorId'), 'c1');
      assert.ok(form.get('document') instanceof File);
      return jsonResponse(200, { content: 'Hello', pages: 2 });
    });
    const file = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' });
    const result = await submitOcr('c1', file);
    assert.deepEqual(result, { content: 'Hello', pages: 2 });
  });

  it('maps timeout and unreachable failures distinctly', async () => {
    mock.method(globalThis, 'fetch', async () => jsonResponse(504, { message: 'internal detail' }));
    await assert.rejects(submitOcr('c1', new File(['x'], 'a.pdf')), error => {
      assert.ok(error instanceof OcrError);
      assert.equal(error.kind, 'timeout');
      assert.equal(error.message, 'OCR timed out.');
      return true;
    });
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
