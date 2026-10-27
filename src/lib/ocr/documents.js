/** Accepted Document types for the OCR Playground. */
export const DOCUMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const MAX_DOCUMENT_BYTES = 30_000_000;

const EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'docx']);

/** @type {Record<string, readonly string[]>} */
const MIME_FOR_EXTENSION = {
  pdf: ['application/pdf'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

/**
 * @param {File} file
 * @param {string} ext
 * @returns {boolean}
 */
function mimeMatchesExtension(file, ext) {
  if (!file.type) return true;
  const allowed = MIME_FOR_EXTENSION[ext];
  if (!allowed) return false;
  return allowed.includes(file.type.toLowerCase());
}

/**
 * @param {File | null | undefined} file
 * @returns {string | null} A user-facing message, or null when valid.
 */
export function validateDocument(file) {
  if (!file || file.size === 0) return 'Choose a PDF, JPEG, PNG, or DOCX file.';
  if (file.size > MAX_DOCUMENT_BYTES) return 'Request is too large.';
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
  if (!ext || !EXTENSIONS.has(ext)) {
    return 'Choose a PDF, JPEG, PNG, or DOCX file.';
  }
  if (!mimeMatchesExtension(file, ext)) {
    return 'Choose a PDF, JPEG, PNG, or DOCX file.';
  }
  return null;
}
