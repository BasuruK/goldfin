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
  return isJsonRecord(body) ? body : null;
}

export interface FetchApiRequestOptions {
  path: string;
  init: RequestInit;
  timeoutMs: number;
  callerSignal?: AbortSignal;
  messages: Record<Exclude<RequestErrorKind, 'canceled'>, string>;
  createError: (kind: RequestErrorKind, message: string) => Error;
  canceledKind?: RequestErrorKind;
  canceledMessage?: string;
  httpTimeoutStatuses?: boolean;
  statusMessage?: (status: number) => string;
}

/** A fetch that threw: the caller's cancel (when the caller maps one), a timeout, or no connection. */
function transportError(error: unknown, options: FetchApiRequestOptions): Error {
  const name = error instanceof Error ? error.name : '';
  if (name === 'AbortError' && options.canceledKind && options.canceledMessage) {
    return options.createError(options.canceledKind, options.canceledMessage);
  }
  const kind = name === 'TimeoutError' ? 'timeout' : 'unreachable';
  return options.createError(kind, options.messages[kind]);
}

function statusErrorKind(status: number, httpTimeoutStatuses = false): 'timeout' | 'unavailable' | 'rejected' {
  if (httpTimeoutStatuses && (status === 408 || status === 504)) return 'timeout';
  return status >= 500 ? 'unavailable' : 'rejected';
}

/** An error status. Only a rejection may carry the server's own message. */
function statusError(status: number, record: Record<string, unknown> | null, options: FetchApiRequestOptions): Error {
  const kind = statusErrorKind(status, options.httpTimeoutStatuses);
  const fallback = options.statusMessage?.(status) ?? options.messages[kind];
  const message = kind === 'rejected' && typeof record?.message === 'string' ? record.message : fallback;
  return options.createError(kind, message);
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
    throw transportError(error, options);
  }
  const record = await readJsonRecord(response);
  if (!response.ok) throw statusError(response.status, record, options);
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
