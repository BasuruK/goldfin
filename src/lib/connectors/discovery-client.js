/**
 * Polls worker-backed model discovery and verification attempts through the API.
 */

const POLL_MS = 400;
const DISCOVERY_TIMEOUT_MS = 60_000;

/** @typedef {{ status: 'queued' | 'running' | 'finished', result?: Record<string, unknown> }} Attempt */

/**
 * @param {string} path
 * @param {Record<string, unknown>} body
 */
async function postAttempt(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const err = new Error('API request failed');
    // ponytail: treat any non-2xx as unreachable for the UI retry path.
    err.code = 'api_missing';
    throw err;
  }
  const payload = await response.json();
  if (!payload?.id) throw new Error('Invalid attempt response');
  return payload.id;
}

/**
 * @param {string} path
 * @param {string} attemptId
 * @returns {Promise<Attempt>}
 */
async function pollAttempt(path, attemptId) {
  const started = performance.now();
  while (performance.now() - started < DISCOVERY_TIMEOUT_MS) {
    const response = await fetch(`${path}/${attemptId}`);
    if (!response.ok) {
      throw new Error('Could not load discovery status');
    }
    const attempt = await response.json();
    if (attempt.status === 'finished') return attempt;
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  throw new Error('Discovery timed out');
}

/**
 * @param {{ connectorId: string, providerType: string, baseUrl: string, apiKey: string }} config
 */
export async function runModelDiscovery(config) {
  const attemptId = await postAttempt('/api/v1/model-discovery/attempts', {
    connectorId: config.connectorId,
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey
  });
  return pollAttempt('/api/v1/model-discovery/attempts', attemptId);
}

/**
 * @param {{ connectorId: string, providerType: string, baseUrl: string, apiKey: string, modelId: string }} config
 */
export async function runModelVerification(config) {
  const attemptId = await postAttempt('/api/v1/model-verification/attempts', {
    connectorId: config.connectorId,
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelId: config.modelId
  });
  return pollAttempt('/api/v1/model-verification/attempts', attemptId);
}
