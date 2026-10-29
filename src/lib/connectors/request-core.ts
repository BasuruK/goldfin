/**
 * Shared fetch transport for frontend API clients (CODING_STANDARDS Frontend async).
 */

export type RequestErrorKind =
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
