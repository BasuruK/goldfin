/**
 * Client-side reachability probe for the Connector dialog.
 * Production Connector checks run on the worker (ADR 0010); this only validates
 * shape and attempts a browser fetch so the UI can show latency or CORS limits.
 */

/** @typedef {'idle' | 'testing' | 'ok' | 'failed'} ConnectionStatus */

/**
 * @param {string} baseUrl
 * @returns {string | null}
 */
export function validateBaseUrl(baseUrl) {
  const trimmed = baseUrl.trim();
  if (!trimmed) return 'Base URL is required.';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return 'Base URL must use http or https.';
    }
    return null;
  } catch {
    return 'Enter a valid URL.';
  }
}

/**
 * @param {{ baseUrl: string, apiKey: string, providerType: string }} config
 * @returns {string | null}
 */
export function validateForCheck(config) {
  const urlError = validateBaseUrl(config.baseUrl);
  if (urlError) return urlError;
  if (config.providerType !== 'web_request' && !config.apiKey.trim()) {
    return 'API Key is required.';
  }
  return null;
}

/** @param {string} message */
export function connectionFailureField(message) {
  if (message === 'API Key is required.') return 'apiKey';
  if (
    message === 'Base URL is required.' ||
    message === 'Base URL must use http or https.' ||
    message === 'Enter a valid URL.'
  ) {
    return 'baseUrl';
  }
  return 'baseUrl';
}

export function finishConnectionCheck(record, requestId, result, checkedAt) {
  if (!record || record.checkRequestId !== requestId) return record;
  return {
    ...record,
    connectionStatus: result.status,
    connectionMessage: result.message,
    lastCheckedAt: checkedAt
  };
}

/** @typedef {import('./providers.js').ProviderType} ProviderType */

/**
 * @param {string} baseUrl
 * @param {ProviderType} providerType
 */
function probeUrl(baseUrl, providerType) {
  const normalized = baseUrl.replace(/\/$/, '');
  if (providerType === 'web_request') return normalized;
  if (providerType === 'azure') return normalized;
  return `${normalized}/models`;
}

/** @typedef {{ status: ConnectionStatus, latencyMs: number | null, message: string }} CheckResult */

/**
 * @param {{ baseUrl: string, apiKey: string, providerType: ProviderType }} config
 * @returns {Promise<CheckResult>}
 */
export async function runConnectionCheck(config) {
  const validationError = validateForCheck(config);
  if (validationError) {
    return { status: 'failed', latencyMs: null, message: validationError };
  }

  const url = probeUrl(config.baseUrl.trim(), config.providerType);
  const headers = {};
  if (config.apiKey.trim()) {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  }

  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: config.providerType === 'web_request' ? 'HEAD' : 'GET',
      headers,
      mode: 'cors'
    });
    const latencyMs = Math.round(performance.now() - started);

    if (response.ok) {
      if (config.providerType === 'web_request') {
        return {
          status: 'ok',
          latencyMs,
          message: `Reachable (${response.status}). A full Connector check will confirm the response path.`
        };
      }
      return {
        status: 'ok',
        latencyMs,
        message: `Reachable (${response.status}). Credential and model id will be confirmed by a Connector check.`
      };
    }

    return {
      status: 'failed',
      latencyMs,
      message: `HTTP ${response.status} from ${new URL(url).host}.`
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - started);
    const detail = error instanceof Error ? error.message : 'Network error';
    const corsHint =
      detail.includes('Failed to fetch') || detail.includes('NetworkError')
        ? ' Browser CORS may block this until the worker runs the check.'
        : '';
    return {
      status: 'failed',
      latencyMs,
      message: `${detail}.${corsHint}`
    };
  }
}
