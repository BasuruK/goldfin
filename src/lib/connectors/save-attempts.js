/**
 * Checked-Save API client (ADR 0012). The API stages a proposal, the worker runs the
 * check, and this client polls the attempt handle. Credentials exist only in the
 * create request; nothing here persists them.
 */

export const SAVE_ATTEMPTS_PATH = '/api/v1/connector-save-attempts';
export const CONNECTORS_PATH = '/api/v1/connectors';

const REQUEST_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 1_000;
const POLL_DEADLINE_MS = 60_000;

/** @typedef {'timeout' | 'unreachable' | 'rejected' | 'unavailable' | 'malformed'} SaveAttemptErrorKind */
/** @typedef {{ kind: 'reachable', httpStatus: number, latencyMs: number }} ReachableFinding */
/** @typedef {{ id: string, state: 'queued' | 'running' | 'finished', connectorId?: string, finding?: ReachableFinding, failureCode?: string }} SaveAttempt */
/** @typedef {{ id: string, name: string, providerType: string, baseUrl: string, credentialLabel?: string, credentialSetAt?: string }} SavedConnector */
/** @typedef {{ name: string, providerType: string, baseUrl: string, credential: string, credentialLabel: string }} SaveDraft */

export class SaveAttemptError extends Error {
  /** @param {SaveAttemptErrorKind} kind @param {string} message */
  constructor(kind, message) {
    super(message);
    this.name = 'SaveAttemptError';
    this.kind = kind;
  }
}

const MESSAGES = {
  timeout: 'The request timed out. Try again.',
  unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
  unavailable: 'Goldfin is unavailable right now. Try again.',
  malformed: 'Goldfin returned an unexpected response.',
  rejected: 'The Save proposal was rejected.'
};

/** @param {unknown} error @returns {boolean} */
function isAbort(error) {
  return error instanceof Error && error.name === 'AbortError';
}

/** @param {unknown} error @returns {SaveAttemptError} */
function mapFetchError(error) {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new SaveAttemptError('timeout', MESSAGES.timeout);
  }
  return new SaveAttemptError('unreachable', MESSAGES.unreachable);
}

/**
 * @param {AbortSignal | undefined} signal
 * @param {number} timeoutMs
 * @returns {AbortSignal}
 */
function requestSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * @param {string} path
 * @param {RequestInit} init
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
 * @returns {Promise<unknown>}
 */
async function requestJSON(path, init, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...init,
      signal: requestSignal(options.signal, options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw mapFetchError(error);
  }
  /** @type {unknown} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    if (response.status >= 500) throw new SaveAttemptError('unavailable', MESSAGES.unavailable);
    const message =
      body && typeof body === 'object' && typeof (/** @type {{ message?: unknown }} */ (body).message) === 'string'
        ? (/** @type {{ message: string }} */ (body).message)
        : MESSAGES.rejected;
    throw new SaveAttemptError('rejected', message);
  }
  if (body === null) throw new SaveAttemptError('malformed', MESSAGES.malformed);
  return body;
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** @param {unknown} body @returns {SaveAttempt} */
function parseAttempt(body) {
  if (!body || typeof body !== 'object') throw new SaveAttemptError('malformed', MESSAGES.malformed);
  const attempt = /** @type {Record<string, unknown>} */ (body);
  if (
    !isNonEmptyString(attempt.id) ||
    typeof attempt.state !== 'string' ||
    !['queued', 'running', 'finished'].includes(attempt.state)
  ) {
    throw new SaveAttemptError('malformed', MESSAGES.malformed);
  }
  /** @type {SaveAttempt} */
  const out = { id: attempt.id, state: /** @type {SaveAttempt['state']} */ (attempt.state) };
  if (attempt.connectorId !== undefined) {
    if (!isNonEmptyString(attempt.connectorId)) throw new SaveAttemptError('malformed', MESSAGES.malformed);
    out.connectorId = attempt.connectorId;
  }
  if (attempt.failureCode !== undefined) {
    if (!isNonEmptyString(attempt.failureCode)) throw new SaveAttemptError('malformed', MESSAGES.malformed);
    out.failureCode = attempt.failureCode;
  }
  if (attempt.finding !== undefined) {
    const finding = /** @type {Record<string, unknown>} */ (attempt.finding ?? {});
    if (
      finding.kind !== 'reachable' ||
      typeof finding.httpStatus !== 'number' ||
      typeof finding.latencyMs !== 'number'
    ) {
      throw new SaveAttemptError('malformed', MESSAGES.malformed);
    }
    out.finding = { kind: 'reachable', httpStatus: finding.httpStatus, latencyMs: finding.latencyMs };
  }
  return out;
}

/**
 * @param {SaveDraft} draft
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<SaveAttempt>}
 */
export async function createSaveAttempt(draft, options = {}) {
  /** @type {Record<string, string>} */
  const payload = {
    name: draft.name.trim(),
    providerType: draft.providerType,
    baseUrl: draft.baseUrl.trim()
  };
  if (draft.credential !== '') {
    payload.credential = draft.credential;
    payload.credentialLabel = draft.credentialLabel.trim();
  }
  const body = await requestJSON(
    SAVE_ATTEMPTS_PATH,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    },
    options
  );
  return parseAttempt(body);
}

/**
 * @param {string} id
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
 * @returns {Promise<SaveAttempt>}
 */
export async function getSaveAttempt(id, options = {}) {
  const body = await requestJSON(`${SAVE_ATTEMPTS_PATH}/${encodeURIComponent(id)}`, {}, options);
  return parseAttempt(body);
}

/**
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<SavedConnector[]>}
 */
export async function listConnectors(options = {}) {
  const body = await requestJSON(CONNECTORS_PATH, {}, options);
  if (!body || typeof body !== 'object' || !Array.isArray(/** @type {{ connectors?: unknown }} */ (body).connectors)) {
    throw new SaveAttemptError('malformed', MESSAGES.malformed);
  }
  return /** @type {{ connectors: unknown[] }} */ (body).connectors.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new SaveAttemptError('malformed', MESSAGES.malformed);
    const connector = /** @type {Record<string, unknown>} */ (entry);
    if (
      !isNonEmptyString(connector.id) ||
      typeof connector.name !== 'string' ||
      !isNonEmptyString(connector.providerType) ||
      typeof connector.baseUrl !== 'string'
    ) {
      throw new SaveAttemptError('malformed', MESSAGES.malformed);
    }
    /** @type {SavedConnector} */
    const out = {
      id: connector.id,
      name: connector.name,
      providerType: connector.providerType,
      baseUrl: connector.baseUrl
    };
    if (connector.credentialLabel !== undefined) {
      if (typeof connector.credentialLabel !== 'string') throw new SaveAttemptError('malformed', MESSAGES.malformed);
      out.credentialLabel = connector.credentialLabel;
    }
    if (connector.credentialSetAt !== undefined) {
      if (typeof connector.credentialSetAt !== 'string') throw new SaveAttemptError('malformed', MESSAGES.malformed);
      out.credentialSetAt = connector.credentialSetAt;
    }
    return out;
  });
}

/**
 * Polls until the attempt finishes, the deadline passes, or the caller aborts.
 * @param {string} id
 * @param {{ signal?: AbortSignal, intervalMs?: number, deadlineMs?: number, onUpdate?: (attempt: SaveAttempt) => void }} [options]
 * @returns {Promise<SaveAttempt>}
 */
export async function pollSaveAttempt(id, options = {}) {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const deadlineMs = options.deadlineMs ?? POLL_DEADLINE_MS;
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    if (options.signal?.aborted) throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SaveAttemptError('timeout', MESSAGES.timeout);
    const attempt = await getSaveAttempt(id, {
      signal: options.signal,
      timeoutMs: Math.min(REQUEST_TIMEOUT_MS, remaining)
    });
    options.onUpdate?.(attempt);
    if (attempt.state === 'finished') return attempt;
    if (Date.now() + intervalMs > deadline) throw new SaveAttemptError('timeout', MESSAGES.timeout);
    await new Promise((resolve, reject) => {
      const signal = options.signal;
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve(undefined);
      }, intervalMs);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/**
 * @param {SaveDraft} draft
 * @returns {{ field: 'name' | 'baseUrl' | 'credential' | 'credentialLabel', message: string } | null}
 */
export function validateSaveDraft(draft) {
  if (!draft.name.trim()) return { field: 'name', message: 'Name is required.' };
  if (!draft.baseUrl.trim()) return { field: 'baseUrl', message: 'Base URL is required.' };
  let url;
  try {
    url = new URL(draft.baseUrl.trim());
  } catch {
    return { field: 'baseUrl', message: 'Enter a valid http(s) URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { field: 'baseUrl', message: 'Enter a valid http(s) URL.' };
  }
  if (url.username || url.password) {
    return { field: 'baseUrl', message: 'Remove the username or password from the URL.' };
  }
  if (url.hash) {
    return { field: 'baseUrl', message: 'Remove the # fragment from the URL.' };
  }
  const secretKeys = ['api_key', 'token', 'access_token', 'sig', 'key', 'subscription-key', 'x-amz-signature'];
  for (const key of url.searchParams.keys()) {
    if (secretKeys.includes(key.toLowerCase())) {
      return { field: 'baseUrl', message: 'Remove secret query parameters from the URL.' };
    }
  }
  if (draft.credential !== '' && url.protocol !== 'https:') {
    return { field: 'baseUrl', message: 'Use https when a Credential is set.' };
  }
  if (/[\p{Cc}]/u.test(draft.credential)) {
    return { field: 'credential', message: 'Remove control characters from the API Key.' };
  }
  if (draft.credential !== '' && !draft.credentialLabel.trim()) {
    return { field: 'credentialLabel', message: 'A label is required when a Credential is set.' };
  }
  return null;
}
