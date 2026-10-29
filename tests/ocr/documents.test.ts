import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_DOCUMENT_BYTES, validateDocument } from '../../src/lib/ocr/documents.ts';

describe('validateDocument', () => {
  it('rejects empty and unsupported files', () => {
    assert.match(validateDocument(null) ?? '', /Choose a PDF/);
    assert.match(validateDocument(new File([], 'empty.pdf', { type: 'application/pdf' })) ?? '', /Choose a PDF/);
    assert.match(validateDocument(new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' })) ?? '', /Choose a PDF/);
  });

  it('rejects files above the application cap', () => {
    const big = new File([new Uint8Array(1)], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: MAX_DOCUMENT_BYTES + 1 });
    assert.equal(validateDocument(big), 'Request is too large.');
  });

  it('accepts supported extensions', () => {
    const pdf = new File(['%PDF-1.4'], 'sample.pdf', { type: 'application/pdf' });
    assert.equal(validateDocument(pdf), null);
  });

  it('rejects a misleading extension when MIME type disagrees', () => {
    const pngNamedPdf = new File([new Uint8Array([1])], 'scan.pdf', { type: 'image/png' });
    assert.match(validateDocument(pngNamedPdf) ?? '', /Choose a PDF/);
  });

  it('allows an empty MIME type so the server can sniff bytes', () => {
    const pdf = new File(['%PDF-1.4'], 'sample.pdf', { type: '' });
    assert.equal(validateDocument(pdf), null);
  });
});
