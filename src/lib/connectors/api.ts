/**
 * Connector API client (ADR 0013). Save is one synchronous request; the Credential exists
 * only in that request and is never persisted here.
 */

import { isJsonRecord, malformed, requestJson } from '../request-core.ts';

// Other surfaces reach Connectors only through this module (`no-surface-to-surface`).
export { AZURE_OCR_PROVIDER_TYPE } from './providers.ts';

export const CONNECTORS_PATH = '/api/v1/connectors';
const REJECTED = 'The Connector was rejected.';

interface SavedConnectorModel {
  id: string;
  enabled: boolean;
}

export interface SavedConnector {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  apiVersion?: string;
  llmApiMode?: string;
  models?: SavedConnectorModel[];
  credentialLabel?: string;
  credentialSetAt?: string;
}

export interface SaveDraft {
  name: string;
  providerType: string;
  baseUrl: string;
  apiVersion?: string;
  llmApiMode?: string;
  models?: SavedConnectorModel[];
  credential: string;
  credentialLabel: string;
}

type DraftValidationField = 'name' | 'baseUrl' | 'credential' | 'credentialLabel';

export interface DraftValidationError {
  field: DraftValidationField;
  message: string;
}

function optionalStringField(body: Record<string, unknown>, key: string): string | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value !== 'string') throw malformed();
  return value;
}

function parseSavedConnector(body: Record<string, unknown>): SavedConnector {
  if (typeof body.id !== 'string' || body.id === '') throw malformed();
  if (typeof body.name !== 'string') throw malformed();
  if (typeof body.providerType !== 'string') throw malformed();
  if (typeof body.baseUrl !== 'string') throw malformed();
  const connector: SavedConnector = {
    id: body.id,
    name: body.name,
    providerType: body.providerType,
    baseUrl: body.baseUrl
  };
  const apiVersion = optionalStringField(body, 'apiVersion');
  if (apiVersion !== undefined) connector.apiVersion = apiVersion;
  const llmApiMode = optionalStringField(body, 'llmApiMode');
  if (llmApiMode !== undefined) connector.llmApiMode = llmApiMode;
  if ('models' in body && body.models !== null && body.models !== undefined) {
    const rawModels = body.models;
    if (!Array.isArray(rawModels)) throw malformed();
    connector.models = rawModels.map((item: unknown) => {
      if (!isJsonRecord(item)) throw malformed();
      if (typeof item.id !== 'string' || typeof item.enabled !== 'boolean') {
        throw malformed();
      }
      return { id: item.id, enabled: item.enabled };
    });
  }
  const credentialLabel = optionalStringField(body, 'credentialLabel');
  if (credentialLabel !== undefined) connector.credentialLabel = credentialLabel;
  const credentialSetAt = optionalStringField(body, 'credentialSetAt');
  if (credentialSetAt !== undefined) connector.credentialSetAt = credentialSetAt;
  return connector;
}

export async function createConnector(draft: SaveDraft): Promise<SavedConnector> {
  const payload: Record<string, unknown> = {
    name: draft.name.trim(),
    providerType: draft.providerType,
    baseUrl: draft.baseUrl.trim()
  };
  if (draft.providerType === 'azure_document_intelligence' && draft.apiVersion?.trim()) {
    payload.apiVersion = draft.apiVersion.trim();
  }
  if (draft.llmApiMode) {
    payload.llmApiMode = draft.llmApiMode;
  }
  if (draft.models?.length) {
    payload.models = draft.models.map(model => ({ id: model.id, enabled: model.enabled }));
  }
  if (draft.credential !== '') {
    payload.credential = draft.credential;
    payload.credentialLabel = draft.credentialLabel.trim();
  }
  const body = await requestJson(CONNECTORS_PATH, REJECTED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return parseSavedConnector(body);
}

export async function listConnectors(): Promise<SavedConnector[]> {
  const body = await requestJson(CONNECTORS_PATH, REJECTED);
  if (!Array.isArray(body.connectors)) throw malformed();
  return body.connectors.map(item => {
    if (!isJsonRecord(item)) throw malformed();
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
  if (draft.providerType === 'openai' || draft.providerType === 'openai_compatible') {
    if (!draft.credential.trim()) {
      return { field: 'credential', message: 'API Key is required for this provider.' };
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
