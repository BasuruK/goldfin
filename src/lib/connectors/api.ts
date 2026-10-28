/**
 * Connector API client (ADR 0013). Save is one synchronous request; the Credential exists
 * only in that request and is never persisted here.
 */

import { fetchApiRequest } from './request-core.ts';

export const CONNECTORS_PATH = '/api/v1/connectors';

const REQUEST_TIMEOUT_MS = 10_000;

export type ApiErrorKind = 'timeout' | 'unreachable' | 'rejected' | 'unavailable' | 'malformed';

export interface SavedConnector {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  apiVersion?: string;
  credentialLabel?: string;
  credentialSetAt?: string;
}

export interface SaveDraft {
  name: string;
  providerType: string;
  baseUrl: string;
  apiVersion?: string;
  credential: string;
  credentialLabel: string;
}

type DraftValidationField = 'name' | 'baseUrl' | 'credential' | 'credentialLabel';

export interface DraftValidationError {
  field: DraftValidationField;
  message: string;
}

export class ApiError extends Error {
  kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
  }
}

const MESSAGES: Record<ApiErrorKind, string> = {
  timeout: 'The request timed out. Try again.',
  unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
  unavailable: 'Goldfin is unavailable right now. Try again.',
  malformed: 'Goldfin returned an unexpected response.',
  rejected: 'The Connector was rejected.'
};

function isApiErrorKind(kind: string): kind is ApiErrorKind {
  return kind in MESSAGES;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function requestJSON(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const { record } = await fetchApiRequest({
    path,
    init,
    timeoutMs: REQUEST_TIMEOUT_MS,
    messages: MESSAGES,
    createError: (kind, message) =>
      new ApiError(isApiErrorKind(kind) ? kind : 'malformed', message)
  });
  if (!record) throw new ApiError('malformed', MESSAGES.malformed);
  return record;
}

function optionalStringField(body: Record<string, unknown>, key: string): string | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value !== 'string') throw new ApiError('malformed', MESSAGES.malformed);
  return value;
}

function parseSavedConnector(body: Record<string, unknown>): SavedConnector {
  if (typeof body.id !== 'string' || body.id === '') throw new ApiError('malformed', MESSAGES.malformed);
  if (typeof body.name !== 'string') throw new ApiError('malformed', MESSAGES.malformed);
  if (typeof body.providerType !== 'string') throw new ApiError('malformed', MESSAGES.malformed);
  if (typeof body.baseUrl !== 'string') throw new ApiError('malformed', MESSAGES.malformed);
  const connector: SavedConnector = {
    id: body.id,
    name: body.name,
    providerType: body.providerType,
    baseUrl: body.baseUrl
  };
  const apiVersion = optionalStringField(body, 'apiVersion');
  if (apiVersion !== undefined) connector.apiVersion = apiVersion;
  const credentialLabel = optionalStringField(body, 'credentialLabel');
  if (credentialLabel !== undefined) connector.credentialLabel = credentialLabel;
  const credentialSetAt = optionalStringField(body, 'credentialSetAt');
  if (credentialSetAt !== undefined) connector.credentialSetAt = credentialSetAt;
  return connector;
}

export async function createConnector(draft: SaveDraft): Promise<SavedConnector> {
  const payload: Record<string, string> = {
    name: draft.name.trim(),
    providerType: draft.providerType,
    baseUrl: draft.baseUrl.trim()
  };
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
  return parseSavedConnector(body);
}

export async function listConnectors(): Promise<SavedConnector[]> {
  const body = await requestJSON(CONNECTORS_PATH);
  if (!Array.isArray(body.connectors)) throw new ApiError('malformed', MESSAGES.malformed);
  return body.connectors.map(item => {
    if (!isJsonRecord(item)) throw new ApiError('malformed', MESSAGES.malformed);
    return parseSavedConnector(item);
  });
}

/**
 * Mirrors the API's rules so a rejection is field-level rather than opaque.
 */
export function validateDraft(draft: SaveDraft): DraftValidationError | null {
  if (!draft.name.trim()) return { field: 'name', message: 'Name is required.' };
  if (draft.providerType === 'azure_document_intelligence') {
    if (!draft.credential.trim()) {
      return { field: 'credential', message: 'API Key is required for Azure Document Intelligence.' };
    }
  }
  if (!draft.baseUrl.trim()) return { field: 'baseUrl', message: 'Base URL is required.' };
  let url: URL;
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
