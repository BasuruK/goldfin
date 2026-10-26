/** Accepted Document types for the OCR Playground. */
export const DOCUMENT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const MAX_DOCUMENT_BYTES = 30_000_000;

const EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'docx']);

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
  return null;
}
