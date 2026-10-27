/**
 * OCR Playground API client. Uses a longer timeout than Connector saves because the route
 * may run for up to five minutes.
 */

export const OCR_PATH = '/api/v1/probes/ocr';

/** Route processing budget (5m) plus server write headroom. */
const OCR_REQUEST_TIMEOUT_MS = 5 * 60 * 1000 + 35 * 1000;

/** @typedef {'timeout' | 'unreachable' | 'rejected' | 'unavailable' | 'malformed' | 'canceled'} OcrErrorKind */
/** @typedef {{ content: string, pages: number }} OcrResult */

export class OcrError extends Error {
  /** @param {OcrErrorKind} kind @param {string} message */
  constructor(kind, message) {
    super(message);
    this.name = 'OcrError';
    this.kind = kind;
  }
}

/**
 * @param {AbortSignal | undefined} callerSignal
 * @returns {AbortSignal}
 */
function ocrRequestSignal(callerSignal) {
  const timeoutSignal = AbortSignal.timeout(OCR_REQUEST_TIMEOUT_MS);
  if (!callerSignal) return timeoutSignal;
  return AbortSignal.any([callerSignal, timeoutSignal]);
}

const MESSAGES = {
  timeout: 'OCR timed out.',
  unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
  unavailable: 'Goldfin is unavailable right now. Try again.',
  malformed: 'Goldfin returned an unexpected response.',
  rejected: 'Invalid OCR request.',
  canceled: 'OCR was canceled.'
};

/**
 * @param {string} connectorId
 * @param {File} document
 * @param {AbortSignal} [signal]
 * @returns {Promise<OcrResult>}
 */
export async function submitOcr(connectorId, document, signal) {
  const form = new FormData();
  form.set('connectorId', connectorId);
  form.set('document', document, document.name);
  let response;
  try {
    response = await fetch(OCR_PATH, {
      method: 'POST',
      body: form,
      signal: ocrRequestSignal(signal)
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OcrError('canceled', MESSAGES.canceled);
    }
    const kind = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable';
    throw new OcrError(kind, MESSAGES[kind]);
  }
  /** @type {unknown} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : null;
  if (!response.ok) {
    if (response.status === 408 || response.status === 504) {
      throw new OcrError('timeout', mapStatus(response.status));
    }
    if (response.status >= 500) {
      throw new OcrError('unavailable', mapStatus(response.status));
    }
    const message = typeof record?.message === 'string' ? record.message : mapStatus(response.status);
    throw new OcrError('rejected', message);
  }
  if (typeof record?.content !== 'string' || typeof record?.pages !== 'number') {
    throw new OcrError('malformed', MESSAGES.malformed);
  }
  return { content: record.content, pages: record.pages };
}

/** @param {number} status */
function mapStatus(status) {
  if (status === 408 || status === 504) return MESSAGES.timeout;
  if (status >= 500) return MESSAGES.unavailable;
  if (status === 413) return 'Request is too large.';
  return MESSAGES.rejected;
}
