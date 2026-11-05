/**
 * OCR Playground API client. Uses a longer timeout than Connector saves because the route
 * may run for up to five minutes.
 */

import { fetchApiRequest } from '../request-core.ts';
import { CHOOSE_DOCUMENT, validateDocument } from './documents.ts';

const OCR_PATH = '/api/v1/probes/ocr';

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
    createError: (kind, message) => new OcrError(kind, message),
    httpTimeoutStatuses: true,
    statusMessage: mapStatus
  });
  if (typeof record?.content !== 'string' || typeof record.pages !== 'number') {
    throw new OcrError('malformed', MESSAGES.malformed);
  }
  return { content: record.content, pages: record.pages };
}

export type AnalysisPlan =
  | { kind: 'invalid'; field: 'document' | 'connector'; message: string }
  | { kind: 'run'; document: File; connectorId: string };

/** What Analyze submits, or the first reason it cannot run yet. */
export function planAnalysis(document: File | null, connectorId: string): AnalysisPlan {
  if (!document) return { kind: 'invalid', field: 'document', message: CHOOSE_DOCUMENT };
  const documentError = validateDocument(document);
  if (documentError) return { kind: 'invalid', field: 'document', message: documentError };
  if (!connectorId) return { kind: 'invalid', field: 'connector', message: 'Choose an Azure OCR Connector.' };
  return { kind: 'run', document, connectorId };
}

/** The status hint after a run: "1 page", "3 pages". */
export function pagesHint(pages: number): string {
  return `${pages} ${pages === 1 ? 'page' : 'pages'}`;
}

/** Keeps the chosen Connector while it is still listed; otherwise the first listed one, or none. */
export function pickConnectorId(current: string, connectors: readonly { id: string }[]): string {
  if (connectors.some(connector => connector.id === current)) return current;
  return connectors[0]?.id ?? '';
}

function mapStatus(status: number): string {
  if (status === 408 || status === 504) return MESSAGES.timeout;
  if (status >= 500) return MESSAGES.unavailable;
  if (status === 413) return 'Request is too large.';
  return MESSAGES.rejected;
}
