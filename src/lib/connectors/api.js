/**
 * Connector API client (ADR 0013). Save is one synchronous request; the Credential exists
 * only in that request and is never persisted here.
 */

export const CONNECTORS_PATH = '/api/v1/connectors';

const REQUEST_TIMEOUT_MS = 10_000;

/** @typedef {'timeout' | 'unreachable' | 'rejected' | 'unavailable' | 'malformed'} ApiErrorKind */
/** @typedef {{ id: string, name: string, providerType: string, baseUrl: string, apiVersion?: string, credentialLabel?: string, credentialSetAt?: string }} SavedConnector */
/** @typedef {{ name: string, providerType: string, baseUrl: string, apiVersion?: string, credential: string, credentialLabel: string }} SaveDraft */

export class ApiError extends Error {
  /** @param {ApiErrorKind} kind @param {string} message */
  constructor(kind, message) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

const MESSAGES = {
  timeout: 'The request timed out. Try again.',
  unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
  unavailable: 'Goldfin is unavailable right now. Try again.',
  malformed: 'Goldfin returned an unexpected response.',
  rejected: 'The Connector was rejected.'
};

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<Record<string, unknown>>}
 */
async function requestJSON(path, init = {}) {
  let response;
  try {
    response = await fetch(path, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    const kind = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable';
    throw new ApiError(kind, MESSAGES[kind]);
  }
  /** @type {unknown} */
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const record = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : null;
  if (!response.ok) {
    if (response.status >= 500) throw new ApiError('unavailable', MESSAGES.unavailable);
    throw new ApiError('rejected', typeof record?.message === 'string' ? record.message : MESSAGES.rejected);
  }
  if (!record) throw new ApiError('malformed', MESSAGES.malformed);
  return record;
}

/** @param {SaveDraft} draft @returns {Promise<SavedConnector>} */
export async function createConnector(draft) {
  /** @type {Record<string, string>} */
  const payload = { name: draft.name.trim(), providerType: draft.providerType, baseUrl: draft.baseUrl.trim() };
  if (draft.providerType === 'azure_document_intelligence' && draft.apiVersion?.trim()) {
    payload.apiVersion = draft.apiVersion.trim();
  }
  if (draft.credential !== '') {
    payload.credential = draft.credential;
    payload.credentialLabel = draft.credentialLabel.trim();
  }
  const body = await requestJSON(CONNECTORS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (typeof body.id !== 'string' || body.id === '') throw new ApiError('malformed', MESSAGES.malformed);
  return /** @type {SavedConnector} */ (/** @type {unknown} */ (body));
}

/** @returns {Promise<SavedConnector[]>} */
export async function listConnectors() {
  const body = await requestJSON(CONNECTORS_PATH);
  if (!Array.isArray(body.connectors)) throw new ApiError('malformed', MESSAGES.malformed);
  return body.connectors;
}

/**
 * Mirrors the API's rules so a rejection is field-level rather than opaque.
 * @param {SaveDraft} draft
 * @returns {{ field: 'name' | 'baseUrl' | 'credential' | 'credentialLabel', message: string } | null}
 */
export function validateDraft(draft) {
  if (!draft.name.trim()) return { field: 'name', message: 'Name is required.' };
  if (draft.providerType === 'azure_document_intelligence') {
    if (!draft.credential.trim()) {
      return { field: 'credential', message: 'API Key is required for Azure Document Intelligence.' };
    }
  }
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
