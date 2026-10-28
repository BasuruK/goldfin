/**
 * Shared fetch transport for frontend API clients (CODING_STANDARDS Frontend async).
 */

/**
 * @param {number} timeoutMs
 * @param {AbortSignal | undefined} callerSignal
 * @returns {AbortSignal}
 */
function requestSignal(timeoutMs, callerSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeoutSignal;
  return AbortSignal.any([callerSignal, timeoutSignal]);
}

/**
 * @param {Response} response
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function readJsonRecord(response) {
  /** @type {unknown} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : null;
}

/**
 * @typedef {Object} FetchApiRequestOptions
 * @property {string} path
 * @property {RequestInit} init
 * @property {number} timeoutMs
 * @property {AbortSignal} [callerSignal]
 * @property {Record<string, string>} messages
 * @property {(kind: string, message: string) => Error} createError
 * @property {string} [canceledKind]
 * @property {string} [canceledMessage]
 * @property {boolean} [httpTimeoutStatuses]
 * @property {(status: number) => string} [statusMessage]
 */

/**
 * @param {FetchApiRequestOptions} options
 * @returns {Promise<{ response: Response, record: Record<string, unknown> | null }>}
 */
export async function fetchApiRequest(options) {
  let response;
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
