/**
 * Shared fetch transport for frontend API clients (CODING_STANDARDS Frontend async).
 */

type RequestErrorKind =
  | 'timeout'
  | 'unreachable'
  | 'rejected'
  | 'unavailable'
  | 'canceled';

function requestSignal(timeoutMs: number, callerSignal: AbortSignal | undefined): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeoutSignal;
  return AbortSignal.any([callerSignal, timeoutSignal]);
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown> | null> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (body && typeof body === 'object') {
    return body as Record<string, unknown>;
  }
  return null;
}

export interface FetchApiRequestOptions {
  path: string;
  init: RequestInit;
  timeoutMs: number;
  callerSignal?: AbortSignal;
  messages: Record<string, string>;
  createError: (kind: RequestErrorKind, message: string) => Error;
  canceledKind?: RequestErrorKind;
  canceledMessage?: string;
  httpTimeoutStatuses?: boolean;
  statusMessage?: (status: number) => string;
}

export async function fetchApiRequest(
  options: FetchApiRequestOptions
): Promise<{ response: Response; record: Record<string, unknown> | null }> {
  let response: Response;
  try {
    response = await fetch(options.path, {
      ...options.init,
      signal: requestSignal(options.timeoutMs, options.callerSignal)
    });
  } catch (error) {
    if (
      options.canceledKind &&
      options.canceledMessage &&
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw options.createError(options.canceledKind, options.canceledMessage);
    }
    const kind = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable';
    throw options.createError(kind, options.messages[kind]);
  }
  const record = await readJsonRecord(response);
  if (!response.ok) {
    if (
      options.httpTimeoutStatuses &&
      (response.status === 408 || response.status === 504)
    ) {
      const message = options.statusMessage
        ? options.statusMessage(response.status)
        : options.messages.timeout;
      throw options.createError('timeout', message);
    }
    if (response.status >= 500) {
      const message = options.statusMessage
        ? options.statusMessage(response.status)
        : options.messages.unavailable;
      throw options.createError('unavailable', message);
    }
    const fallback = options.statusMessage
      ? options.statusMessage(response.status)
      : options.messages.rejected;
    const message = typeof record?.message === 'string' ? record.message : fallback;
    throw options.createError('rejected', message);
  }
  return { response, record };
}

export type ApiErrorKind = 'timeout' | 'unreachable' | 'rejected' | 'unavailable' | 'malformed';

/** A failed request to a Goldfin JSON route, carrying the mapped message the UI shows. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

const API_REQUEST_TIMEOUT_MS = 10_000;

const API_MESSAGES = {
  timeout: 'The request timed out. Try again.',
  unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
  unavailable: 'Goldfin is unavailable right now. Try again.',
  malformed: 'Goldfin returned an unexpected response.'
};

export function malformed(): ApiError {
  return new ApiError('malformed', API_MESSAGES.malformed);
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * One request to a Goldfin JSON route. `rejected` is the caller's message for a 4xx
 * that carries no server message (CODING_STANDARDS Caller-neutral errors).
 */
export async function requestJson(path: string, rejected: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const { record } = await fetchApiRequest({
    path,
    init,
    timeoutMs: API_REQUEST_TIMEOUT_MS,
    messages: { ...API_MESSAGES, rejected },
    // No canceledKind is passed, so fetchApiRequest never reports 'canceled' here.
    createError: (kind, message) => new ApiError(kind === 'canceled' ? 'malformed' : kind, message)
  });
  if (!record) throw malformed();
  return record;
}
