/**
 * Polls worker-backed model discovery and verification attempts through the API.
 */

const POLL_MS = 400;
const DISCOVERY_TIMEOUT_MS = 60_000;
const FETCH_TIMEOUT_MS = 30_000;

/** @typedef {{ status: 'queued' | 'running' | 'finished', result?: Record<string, unknown> }} Attempt */

/**
 * @param {Response} response
 */
async function readJSON(response) {
  try {
    return await response.json();
  } catch {
    throw new Error('Invalid attempt response');
  }
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
      signal: requestSignal(signal)
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const err = new Error('API request failed');
    err.code = 'api_missing';
    throw err;
  }
  if (!response.ok) {
    if (response.status === 404 || (response.status >= 502 && response.status <= 504)) {
      const err = new Error('API request failed');
      err.code = 'api_missing';
      throw err;
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
  const payload = await readJSON(response);
  if (!payload?.id) throw new Error('Invalid attempt response');
  return payload.id;
}

/**
 * @param {AbortSignal | undefined} parent
 */
function requestSignal(parent) {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return parent ? AbortSignal.any([parent, timeout]) : timeout;
}

/**
 * @param {string} path
 * @param {string} attemptId
 * @param {{ operation?: string, signal?: AbortSignal }} [options]
 * @returns {Promise<Attempt>}
 */
async function pollAttempt(path, attemptId, options = {}) {
  const operation = options.operation ?? 'Discovery';
  const started = performance.now();
  while (performance.now() - started < DISCOVERY_TIMEOUT_MS) {
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    let response;
    try {
      response = await fetch(`${path}/${attemptId}`, { signal: requestSignal(options.signal) });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const err = new Error(`Could not load ${operation.toLowerCase()} status`);
      err.code = 'api_missing';
      throw err;
    }
    if (!response.ok) {
      if (response.status === 404 || (response.status >= 502 && response.status <= 504)) {
        const err = new Error(`Could not load ${operation.toLowerCase()} status`);
        err.code = 'api_missing';
        throw err;
      }
      throw new Error(`Could not load ${operation.toLowerCase()} status`);
    }
    const attempt = await readJSON(response);
    if (attempt.status === 'finished') return attempt;
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`${operation} timed out`);
}

/**
 * @param {{ connectorId: string, providerType: string, baseUrl: string, apiKey: string, signal?: AbortSignal }} config
 */
export async function runModelDiscovery(config) {
  const attemptId = await postAttempt('/api/v1/model-discovery/attempts', {
    connectorId: config.connectorId,
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey
  }, config.signal);
  return pollAttempt('/api/v1/model-discovery/attempts', attemptId, {
    operation: 'Discovery',
    signal: config.signal
  });
}

/**
 * @param {{ connectorId: string, providerType: string, baseUrl: string, apiKey: string, modelId: string, signal?: AbortSignal }} config
 */
export async function runModelVerification(config) {
  const attemptId = await postAttempt('/api/v1/model-verification/attempts', {
    connectorId: config.connectorId,
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelId: config.modelId
  }, config.signal);
  return pollAttempt('/api/v1/model-verification/attempts', attemptId, {
    operation: 'Verification',
    signal: config.signal
  });
}
