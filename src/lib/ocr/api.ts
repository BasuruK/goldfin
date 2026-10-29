/**
 * OCR Playground API client. Uses a longer timeout than Connector saves because the route
 * may run for up to five minutes.
 */

import { fetchApiRequest } from '../connectors/request-core.ts';

export const OCR_PATH = '/api/v1/probes/ocr';

/** Route processing budget (5m) plus server write headroom. */
const OCR_REQUEST_TIMEOUT_MS = 5 * 60 * 1000 + 35 * 1000;

type OcrErrorKind =
  | 'timeout'
  | 'unreachable'
  | 'rejected'
  | 'unavailable'
  | 'malformed'
  | 'canceled';

interface OcrResult {
  content: string;
  pages: number;
}

export class OcrError extends Error {
  readonly kind: OcrErrorKind;

  constructor(kind: OcrErrorKind, message: string) {
    super(message);
    this.name = 'OcrError';
    this.kind = kind;
  }
}

const MESSAGES: Record<OcrErrorKind, string> = {
  timeout: 'OCR timed out.',
  unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
  unavailable: 'Goldfin is unavailable right now. Try again.',
  malformed: 'Goldfin returned an unexpected response.',
  rejected: 'Invalid OCR request.',
  canceled: 'OCR was canceled.'
};

export async function submitOcr(
  connectorId: string,
  document: File,
  signal?: AbortSignal
): Promise<OcrResult> {
  const form = new FormData();
  form.set('connectorId', connectorId);
  form.set('document', document, document.name);
  const { record } = await fetchApiRequest({
    path: OCR_PATH,
    init: { method: 'POST', body: form },
    timeoutMs: OCR_REQUEST_TIMEOUT_MS,
    callerSignal: signal,
    canceledKind: 'canceled',
    canceledMessage: MESSAGES.canceled,
    messages: MESSAGES,
    createError: (kind, message) => {
      switch (kind) {
        case 'timeout':
        case 'unreachable':
        case 'rejected':
        case 'unavailable':
        case 'canceled':
          return new OcrError(kind, message);
        default: {
          const unreachable: never = kind;
          return new OcrError(unreachable, message);
        }
      }
    },
    httpTimeoutStatuses: true,
    statusMessage: mapStatus
  });
  if (typeof record?.content !== 'string' || typeof record?.pages !== 'number') {
    throw new OcrError('malformed', MESSAGES.malformed);
  }
  return { content: record.content, pages: record.pages };
}

function mapStatus(status: number): string {
  if (status === 408 || status === 504) return MESSAGES.timeout;
  if (status >= 500) return MESSAGES.unavailable;
  if (status === 413) return 'Request is too large.';
  return MESSAGES.rejected;
}
