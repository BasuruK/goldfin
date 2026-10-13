/**
 * Polls worker-backed model discovery and verification attempts through the API.
 */

const POLL_MS = 400;
const DISCOVERY_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 30_000;

/** @typedef {{ status: 'queued' | 'running' | 'finished', result?: Record<string, unknown> }} Attempt */

/** @param {string} message */
function apiMissingError(message) {
  const err = new Error(message);
  err.code = 'api_missing';
  return err;
}

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(ms);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** @param {AbortSignal} [signal] */
function fetchSignal(signal) {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * @param {unknown} error
 * @param {AbortSignal} [signal]
 */
function mapFetchError(error, signal) {
  if (signal?.aborted) throw error;
  if (error instanceof Error && error.name === 'TimeoutError') {
    throw new Error(`The request timed out after ${FETCH_TIMEOUT_MS / 1000}s.`);
  }
  throw apiMissingError('API request failed');
}

/**
 * @param {string} path
 * @param {Record<string, unknown>} body
 * @param {AbortSignal} [signal]
 */
async function postAttempt(path, body, signal) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: fetchSignal(signal)
    });
  } catch (error) {
    mapFetchError(error, signal);
  }
  if (!response.ok) {
    if (response.status === 404 || (response.status >= 502 && response.status <= 504)) {
      throw apiMissingError('API request failed');
    }
    if (response.status === 400) {
      let message = 'API request failed';
      try {
        const payload = await response.json();
        if (payload && typeof payload.message === 'string' && payload.message) message = payload.message;
      } catch {
        // The status is enough when the body is not JSON.
      }
      throw new Error(message);
    }
    throw new Error('API request failed');
  }
  const payload = await response.json();
  if (!payload?.id) throw new Error('Invalid attempt response');
  return payload.id;
}

/**
 * @param {string} path
 * @param {string} attemptId
 * @param {string} label
 * @param {AbortSignal} [signal]
 * @returns {Promise<Attempt>}
 */
async function pollAttempt(path, attemptId, label, signal) {
  const deadline = AbortSignal.timeout(DISCOVERY_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  while (!combined.aborted) {
    let response;
    try {
      response = await fetch(`${path}/${attemptId}`, { signal: fetchSignal(combined) });
    } catch (error) {
      if (combined.aborted) throw error;
      mapFetchError(error, combined);
    }
    if (!response.ok) {
      throw new Error(`Could not load ${label} status`);
    }
    const attempt = await response.json();
    const status = attempt.status;
    if (status === 'finished' || status === 'queued' || status === 'running') {
      if (status === 'finished') return attempt;
      await sleep(POLL_MS, combined);
      continue;
    }
    throw new Error(`Could not load ${label} status`);
  }
  throw new Error(`${label} timed out`);
}

/**
 * @param {{ connectorId: string, providerType: string, baseUrl: string, apiKey: string }} config
 * @param {AbortSignal} [signal]
 */
export async function runModelDiscovery(config, signal) {
  const attemptId = await postAttempt('/api/v1/model-discovery/attempts', {
    connectorId: config.connectorId,
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey
  }, signal);
  return pollAttempt('/api/v1/model-discovery/attempts', attemptId, 'discovery', signal);
}

/**
 * @param {{ connectorId: string, providerType: string, baseUrl: string, apiKey: string, modelId: string }} config
 * @param {AbortSignal} [signal]
 */
export async function runModelVerification(config, signal) {
  const attemptId = await postAttempt('/api/v1/model-verification/attempts', {
    connectorId: config.connectorId,
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelId: config.modelId
  }, signal);
  return pollAttempt('/api/v1/model-verification/attempts', attemptId, 'verification', signal);
}
