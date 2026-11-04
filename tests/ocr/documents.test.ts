import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DOCUMENT_ACCEPT, validateDocument } from '../../src/lib/ocr/documents.ts';

const CHOOSE = 'Choose a PDF, JPEG, PNG, or DOCX file.';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function sized(name: string, size: number): File {
  const file = new File([new Uint8Array(1)], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('validateDocument', () => {
  it('rejects empty and unsupported files', () => {
    assert.equal(validateDocument(new File([], 'empty.pdf', { type: 'application/pdf' })), CHOOSE);
    for (const file of [
      new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' }),
      new File([new Uint8Array([1])], 'notes.txt'),
      new File([new Uint8Array([1])], 'pdf', { type: 'application/pdf' })
    ]) {
      assert.equal(validateDocument(file), CHOOSE, file.name);
    }
  });

  it('rejects files above the 30 MB cap the API enforces, and accepts one at it', () => {
    assert.equal(validateDocument(sized('big.pdf', 30_000_001)), 'Request is too large.');
    assert.equal(validateDocument(sized('limit.pdf', 30_000_000)), null);
  });

  it('accepts each supported extension, in any case, with its MIME type', () => {
    for (const [name, type] of [
      ['sample.pdf', 'application/pdf'],
      ['photo.jpg', 'image/jpeg'],
      ['photo.JPEG', 'image/jpeg'],
      ['scan.png', 'image/png'],
      ['letter.docx', DOCX]
    ] as const) {
      assert.equal(validateDocument(new File(['x'], name, { type })), null, name);
    }
  });

  it('offers the file picker every supported extension and MIME type', () => {
    assert.deepEqual(DOCUMENT_ACCEPT.split(','), [
      '.pdf', '.jpg', '.jpeg', '.png', '.docx', 'application/pdf', 'image/jpeg', 'image/png', DOCX
    ]);
  });

  it('rejects a misleading extension when MIME type disagrees', () => {
    const pngNamedPdf = new File([new Uint8Array([1])], 'scan.pdf', { type: 'image/png' });
    assert.equal(validateDocument(pngNamedPdf), CHOOSE);
  });

  it('allows an empty MIME type so the server can sniff bytes', () => {
    const pdf = new File(['%PDF-1.4'], 'sample.pdf', { type: '' });
    assert.equal(validateDocument(pdf), null);
  });
});
