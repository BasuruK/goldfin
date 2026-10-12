/**
 * Client-side reachability probe for the Connector dialog.
 * Production Connector checks run on the worker (ADR 0010); this only validates
 * shape and attempts a browser fetch so the UI can surface CORS limits.
 */

import { providerByType } from './providers.js';

/** @typedef {'idle' | 'testing' | 'ok' | 'failed'} ConnectionStatus */

const CHECK_TIMEOUT_MS = 10_000;

/** @param {string} hostname */
function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

/**
 * @param {string} baseUrl
 * @returns {string | null}
 */
export function validateBaseUrl(baseUrl) {
  const trimmed = baseUrl.trim();
  if (!trimmed) return 'Base URL is required.';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
      return 'Base URL must use https (http is allowed only for localhost).';
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
  if (config.providerType !== 'web_request' && !String(config.apiKey ?? '').trim()) {
    return 'API Key is required.';
  }
  return null;
}

/** @param {string} message */
export function connectionFailureField(message) {
  if (message === 'API Key is required.') return 'apiKey';
  if (
    message === 'Base URL is required.' ||
    message === 'Base URL must use https (http is allowed only for localhost).' ||
    message === 'Enter a valid URL.'
  ) {
    return 'baseUrl';
  }
  return null;
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
  const path = providerByType(providerType).modelProbePath;
  if (path) return `${normalized}${path}`;
  return normalized;
}

/** @typedef {{ status: ConnectionStatus, message: string, field?: 'baseUrl' | 'apiKey' | null }} CheckResult */

/**
 * @param {{ baseUrl: string, apiKey: string, providerType: ProviderType }} config
 * @returns {Promise<CheckResult>}
 */
export async function runConnectionCheck(config) {
  const validationError = validateForCheck(config);
  if (validationError) {
    const field = connectionFailureField(validationError);
    return { status: 'failed', message: validationError, field };
  }

  const url = probeUrl(String(config.baseUrl).trim(), config.providerType);
  const headers = {};
  const apiKey = String(config.apiKey ?? '').trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const started = performance.now();
  try {
    const response = await fetch(url, {
      method: config.providerType === 'web_request' ? 'HEAD' : 'GET',
      headers,
      mode: 'cors',
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    });
    const latencyMs = Math.round(performance.now() - started);

    if (response.ok) {
      if (config.providerType === 'web_request') {
        return {
          status: 'ok',
          message: `Reachable (${response.status}, ${latencyMs}ms). A full Connector check will confirm the response path.`
        };
      }
      return {
        status: 'ok',
        message: `Reachable (${response.status}, ${latencyMs}ms). Credential and model id will be confirmed by a Connector check.`
      };
    }

    return {
      status: 'failed',
      message: `HTTP ${response.status} from ${new URL(url).host}.`,
      field: null
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network error';
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    const corsHint =
      detail.includes('Failed to fetch') || detail.includes('NetworkError')
        ? ' Browser CORS may block this until the worker runs the check.'
        : '';
    const message = timedOut
      ? `Connection check timed out after ${CHECK_TIMEOUT_MS / 1000}s.`
      : `${detail}.${corsHint}`;
    return {
      status: 'failed',
      message,
      field: null
    };
  }
}
