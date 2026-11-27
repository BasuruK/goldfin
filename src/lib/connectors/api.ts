/**
 * Connector API client (ADR 0013). Save is one synchronous request; the Credential exists
 * only in that request and is never persisted here.
 */

import { ApiError, fetchApiRequest, isJsonRecord, malformed, requestJson } from '../request-core.ts';
import {
  AZURE_OCR_PROVIDER_TYPE,
  DEFAULT_AZURE_OCR_API_VERSION,
  isLlmProvider,
  isModelOwningProvider,
  isSavableProvider
} from './providers.ts';
import type { ConnectorRecord } from './storage.ts';

// Other surfaces reach Connectors only through this module (`no-surface-to-surface`).
export {
  AZURE_FOUNDRY_PROVIDER_TYPE,
  AZURE_OCR_PROVIDER_TYPE,
  isLlmProvider,
  isOcrConnectorProvider,
  providerByType
} from './providers.ts';

const CONNECTORS_PATH = '/api/v1/connectors';
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

export type SaveErrorField = DraftValidationField | 'models';

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string') throw malformed();
  return value;
}

function optionalStringField(body: Record<string, unknown>, key: string): string | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value !== 'string') throw malformed();
  return value;
}

const OPTIONAL_STRING_FIELDS = ['apiVersion', 'llmApiMode', 'credentialLabel', 'credentialSetAt'] as const;

/** An absent or null `models` is no list; anything else must be a list of `{ id, enabled }`. */
function parseModels(value: unknown): SavedConnectorModel[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value)) throw malformed();
  return value.map((item: unknown) => {
    if (!isJsonRecord(item) || typeof item.id !== 'string' || typeof item.enabled !== 'boolean') {
      throw malformed();
    }
    return { id: item.id, enabled: item.enabled };
  });
}

function parseSavedConnector(body: Record<string, unknown>): SavedConnector {
  const connector: SavedConnector = {
    id: requiredString(body, 'id'),
    name: requiredString(body, 'name'),
    providerType: requiredString(body, 'providerType'),
    baseUrl: requiredString(body, 'baseUrl')
  };
  if (connector.id === '') throw malformed();
  for (const key of OPTIONAL_STRING_FIELDS) {
    const value = optionalStringField(body, key);
    if (value !== undefined) connector[key] = value;
  }
  const models = parseModels(body.models);
  if (models) connector.models = models;
  return connector;
}

export type UpdateDraft = Omit<SaveDraft, 'credential' | 'credentialLabel'> & {
  credential?: string;
  credentialLabel?: string;
};

function attachConnectorOptions(payload: Record<string, unknown>, draft: SaveDraft | UpdateDraft): void {
  if (draft.providerType === AZURE_OCR_PROVIDER_TYPE && draft.apiVersion?.trim()) {
    payload.apiVersion = draft.apiVersion.trim();
  }
  if (isLlmProvider(draft.providerType) && draft.llmApiMode) {
    payload.llmApiMode = draft.llmApiMode;
  }
  if (isModelOwningProvider(draft.providerType) && draft.models?.length) {
    payload.models = draft.models.map(model => ({ id: model.id, enabled: model.enabled }));
  }
}

function attachCredentialFields(
  payload: Record<string, unknown>,
  draft: SaveDraft | UpdateDraft,
  mode: 'create' | 'update'
): void {
  const credential = draft.credential?.trim() ?? '';
  const label = draft.credentialLabel?.trim() ?? '';
  if (mode === 'create') {
    if (credential === '') return;
    payload.credential = draft.credential;
    payload.credentialLabel = label;
    return;
  }
  if (credential) {
    payload.credential = draft.credential;
    if (label) payload.credentialLabel = label;
    return;
  }
  if (label) payload.credentialLabel = label;
}

function connectorPayload(draft: SaveDraft | UpdateDraft, mode: 'create' | 'update'): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: draft.name.trim(),
    providerType: draft.providerType,
    baseUrl: draft.baseUrl.trim()
  };
  attachConnectorOptions(payload, draft);
  attachCredentialFields(payload, draft, mode);
  return payload;
}

export async function updateConnector(id: string, draft: UpdateDraft): Promise<SavedConnector> {
  const body = await requestJson(`${CONNECTORS_PATH}/${id}`, REJECTED, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connectorPayload(draft, 'update'))
  });
  return parseSavedConnector(body);
}

export async function deleteConnector(id: string): Promise<void> {
  await fetchApiRequest({
    path: `${CONNECTORS_PATH}/${encodeURIComponent(id)}`,
    init: { method: 'DELETE' },
    timeoutMs: 10_000,
    messages: {
      timeout: 'The request timed out. Try again.',
      unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
      unavailable: 'Goldfin is unavailable right now. Try again.',
      rejected: 'Could not delete the Connector.'
    },
    createError: (kind, message) => new ApiError(kind === 'canceled' ? 'malformed' : kind, message)
  });
}

export async function createConnector(draft: SaveDraft): Promise<SavedConnector> {
  const body = await requestJson(CONNECTORS_PATH, REJECTED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(connectorPayload(draft, 'create'))
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

function credentialRequiredMessage(providerType: string): string | null {
  if (providerType === AZURE_OCR_PROVIDER_TYPE) return 'API Key is required for Azure Document Intelligence.';
  return isModelOwningProvider(providerType) ? 'API Key is required for this provider.' : null;
}

const SECRET_QUERY_KEYS = ['api_key', 'token', 'access_token', 'sig', 'key', 'subscription-key', 'x-amz-signature'];

/** The URL when it parses with an http(s) scheme, else null. */
function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function baseUrlProblem(draft: SaveDraft): string | null {
  const value = draft.baseUrl.trim();
  if (!value) return 'Base URL is required.';
  const url = parseHttpUrl(value);
  if (!url) return 'Enter a valid http(s) URL.';
  if (url.username || url.password) return 'Remove the username or password from the URL.';
  if (url.hash) return 'Remove the # fragment from the URL.';
  if ([...url.searchParams.keys()].some(key => SECRET_QUERY_KEYS.includes(key.toLowerCase()))) {
    return 'Remove secret query parameters from the URL.';
  }
  if (draft.credential !== '' && url.protocol !== 'https:') return 'Use https when a Credential is set.';
  return null;
}

/**
 * Mirrors the API's rules so a rejection is field-level rather than opaque.
 */
function draftCredentialError(
  draft: SaveDraft,
  hasStoredCredential = false
): DraftValidationError | null {
  const message = credentialRequiredMessage(draft.providerType);
  if (!message || (hasStoredCredential && !draft.credential.trim())) return null;
  if (!draft.credential.trim()) return { field: 'credential', message };
  return null;
}

export function validateDraft(draft: SaveDraft, options?: { hasStoredCredential?: boolean }): DraftValidationError | null {
  if (!draft.name.trim()) return { field: 'name', message: 'Name is required.' };
  const credentialError = draftCredentialError(draft, options?.hasStoredCredential);
  if (credentialError) return credentialError;
  const urlProblem = baseUrlProblem(draft);
  if (urlProblem) return { field: 'baseUrl', message: urlProblem };
  if (/[\p{Cc}]/u.test(draft.credential)) {
    return { field: 'credential', message: 'Remove control characters from the API Key.' };
  }
  if (draft.credential !== '' && !draft.credentialLabel.trim()) {
    return { field: 'credentialLabel', message: 'A label is required when a Credential is set.' };
  }
  return null;
}

export type SavePlan =
  | { kind: 'invalid'; field: SaveErrorField | null; message: string }
  | { kind: 'save'; request: SaveDraft }
  | { kind: 'update'; request: UpdateDraft };

export interface PlanOptions {
  editing?: boolean;
  hasStoredCredential?: boolean;
}

function saveRequest(draft: ConnectorRecord): SaveDraft {
  const llm = isLlmProvider(draft.providerType);
  const modelOwning = isModelOwningProvider(draft.providerType);
  return {
    name: draft.name,
    providerType: draft.providerType,
    baseUrl: draft.baseUrl,
    apiVersion:
      draft.providerType === AZURE_OCR_PROVIDER_TYPE
        ? draft.apiVersion.trim() || DEFAULT_AZURE_OCR_API_VERSION
        : undefined,
    llmApiMode: llm ? draft.llmApiMode : undefined,
    models: modelOwning ? draft.models.map(model => ({ id: model.id, enabled: model.enabled })) : undefined,
    credential: draft.apiKey,
    credentialLabel: draft.credentialLabel
  };
}

function updateRequest(draft: ConnectorRecord): UpdateDraft {
  const base = saveRequest(draft);
  const request: UpdateDraft = {
    name: base.name,
    providerType: base.providerType,
    baseUrl: base.baseUrl,
    apiVersion: base.apiVersion,
    llmApiMode: base.llmApiMode,
    models: base.models
  };
  if (base.credential) request.credential = base.credential;
  if (base.credentialLabel) request.credentialLabel = base.credentialLabel;
  return request;
}

/** The request Save sends for this draft, or the first reason it cannot be sent yet. */
export function planSave(draft: ConnectorRecord, options: PlanOptions = {}): SavePlan {
  if (!isSavableProvider(draft.providerType)) {
    return { kind: 'invalid', field: null, message: 'Saving is not available for this provider yet.' };
  }
  const modelOwning = isModelOwningProvider(draft.providerType);
  const hasStored = Boolean(options.hasStoredCredential);
  if (modelOwning && !draft.apiKey.trim() && !hasStored) {
    return { kind: 'invalid', field: 'credential', message: 'API Key is required for this provider.' };
  }
  if (modelOwning && !draft.models.some(model => model.enabled)) {
    return { kind: 'invalid', field: 'models', message: 'Enable at least one model ID before saving.' };
  }
  const request = saveRequest(draft);
  const invalid = validateDraft(request, { hasStoredCredential: hasStored });
  if (invalid) return { kind: 'invalid', ...invalid };
  return options.editing ? { kind: 'update', request: updateRequest(draft) } : { kind: 'save', request };
}
