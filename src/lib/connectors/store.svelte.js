import { finishConnectionCheck, runConnectionCheck } from './connection-check.js';
import { defaultBaseUrlFor, defaultNameFor } from './providers.js';
import { createEmptyConnector, loadConnectors, saveConnectors } from './storage.js';
import { applyConnectorPatch, beginDiscovery, finishDiscovery, addManualModel, isCatalogEditable } from './models.js';
import { discoveryAttemptToResult } from './discovery-result.js';
import { runModelDiscovery, runModelVerification } from './discovery-client.js';
import { validateForCheck } from './connection-check.js';

/** @typedef {import('./storage.js').ConnectorRecord} ConnectorRecord */
/** @typedef {import('./providers.js').ProviderType} ProviderType */

const PERSIST_DEBOUNCE_MS = 300;
/** @type {ReturnType<typeof setTimeout> | null} */
let persistTimer = null;

/** @param {ConnectorRecord[]} list @param {{ immediate?: boolean }} [options] */
function persist(list, options = {}) {
  if (options.immediate) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    saveConnectors(list);
    return;
  }
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    saveConnectors(list);
  }, PERSIST_DEBOUNCE_MS);
}

function touch(record, patch) {
  return { ...applyConnectorPatch(record, patch), updatedAt: new Date().toISOString() };
}

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export const connectorStore = $state({
  connectors: loadConnectors(),
  dialogOpen: false,
  editingId: null,
  adding: false
});

/** @returns {ConnectorRecord | null} */
export function editingConnector() {
  if (!connectorStore.editingId) return null;
  return connectorStore.connectors.find(c => c.id === connectorStore.editingId) ?? null;
}

export function openAddDialog() {
  const draft = createEmptyConnector('openai');
  draft.name = defaultNameFor('openai');
  draft.baseUrl = defaultBaseUrlFor('openai');
  connectorStore.connectors = [...connectorStore.connectors, draft];
  connectorStore.editingId = draft.id;
  connectorStore.adding = true;
  connectorStore.dialogOpen = true;
  persist(connectorStore.connectors, { immediate: true });
}

/** @param {string} id */
export function openEditDialog(id) {
  connectorStore.editingId = id;
  connectorStore.adding = false;
  connectorStore.dialogOpen = true;
}

export function closeDialog() {
  connectorStore.dialogOpen = false;
  connectorStore.editingId = null;
  connectorStore.adding = false;
  persist(connectorStore.connectors, { immediate: true });
}

/** @param {string} id */
export function removeDraftIfEmpty(id) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record) return;
  const nameDiffersFromDefault = safeTrim(record.name) !== defaultNameFor(record.providerType);
  const hasContent =
    safeTrim(record.apiKey) ||
    safeTrim(record.baseUrl) !== defaultBaseUrlFor(record.providerType) ||
    nameDiffersFromDefault;
  if (!hasContent) {
    connectorStore.connectors = connectorStore.connectors.filter(c => c.id !== id);
    persist(connectorStore.connectors, { immediate: true });
  }
}

/** @param {string} id @param {Partial<ConnectorRecord>} patch @param {{ immediate?: boolean }} [options] */
export function patchConnector(id, patch, options) {
  connectorStore.connectors = connectorStore.connectors.map(c =>
    c.id === id ? touch(c, patch) : c
  );
  persist(connectorStore.connectors, options);
}

/** @param {string} id @param {ProviderType} providerType */
export function setProviderType(id, providerType) {
  const current = connectorStore.connectors.find(c => c.id === id);
  if (!current) return;
  const wasDefault = current.baseUrl === defaultBaseUrlFor(current.providerType);
  patchConnector(id, {
    providerType,
    name: current.name === defaultNameFor(current.providerType) ? defaultNameFor(providerType) : current.name,
    baseUrl: wasDefault || !safeTrim(current.baseUrl) ? defaultBaseUrlFor(providerType) : current.baseUrl,
    connectionStatus: 'idle',
    connectionMessage: ''
  });
}

/** @param {string} id */
export function deleteConnector(id) {
  connectorStore.connectors = connectorStore.connectors.filter(c => c.id !== id);
  persist(connectorStore.connectors, { immediate: true });
  if (connectorStore.editingId === id) {
    closeDialog();
  }
}

/** @param {string} id */
export async function testConnectorById(id) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record) return;
  const requestId = crypto.randomUUID();

  patchConnector(id, { connectionStatus: 'testing', connectionMessage: 'Checking…', checkRequestId: requestId }, {
    immediate: true
  });
  let result;
  try {
    result = await runConnectionCheck({
      baseUrl: record.baseUrl,
      apiKey: record.apiKey,
      providerType: record.providerType
    });
  } catch {
    result = {
      status: 'failed',
      message: 'Could not run the connection check. Try again.',
      field: null
    };
  }
  const current = connectorStore.connectors.find(c => c.id === id);
  const finished = finishConnectionCheck(current, requestId, result, new Date().toISOString());
  if (finished !== current) patchConnector(id, finished, { immediate: true });
}

export async function discoverModelsById(id) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record) return;
  const validationError = validateForCheck({
    baseUrl: record.baseUrl,
    apiKey: record.apiKey,
    providerType: record.providerType
  });
  if (validationError) {
    patchConnector(id, { catalogState: 'failed', catalogMessage: validationError }, { immediate: true });
    return;
  }
  const loading = beginDiscovery(record);
  patchConnector(id, loading, { immediate: true });
  let result = { state: 'failed', message: 'Could not load models. Try again.' };
  try {
    const attempt = await runModelDiscovery({
      connectorId: record.id,
      providerType: record.providerType,
      baseUrl: record.baseUrl,
      apiKey: record.apiKey
    });
    const mapped = discoveryAttemptToResult(attempt);
    if (mapped) result = mapped;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === 'api_missing') {
      result = {
        state: 'failed',
        message: 'Model discovery API is unreachable. Start the API and worker, then try again.'
      };
    }
  }
  const current = connectorStore.connectors.find(c => c.id === id);
  if (!current) return;
  const finished = finishDiscovery(current, loading.discoveryRevision, result);
  if (finished !== current) patchConnector(id, finished, { immediate: true });
}

/** @deprecated Use discoverModelsById; kept for transitional imports. */
export const previewModelsById = discoverModelsById;

export async function setModelEnabled(id, modelId, enabled) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record || !isCatalogEditable(record)) return;
  const target = (record.models ?? []).find(model => model.id === modelId);
  if (!target) return;
  patchConnector(id, {
    models: (record.models ?? []).map(model => (model.id === modelId ? { ...model, enabled } : model))
  });
  if (!enabled || target.verified) return;
  await verifyModelById(id, modelId);
}

export async function verifyModelById(id, modelId) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record) return;
  const validationError = validateForCheck({
    baseUrl: record.baseUrl,
    apiKey: record.apiKey,
    providerType: record.providerType
  });
  if (validationError) return;
  try {
    const attempt = await runModelVerification({
      connectorId: record.id,
      providerType: record.providerType,
      baseUrl: record.baseUrl,
      apiKey: record.apiKey,
      modelId
    });
    const payload = attempt.result;
    if (!payload || payload.verified !== true) return;
    const current = connectorStore.connectors.find(c => c.id === id);
    if (!current) return;
    patchConnector(id, {
      models: (current.models ?? []).map(model =>
        model.id === modelId ? { ...model, verified: true } : model
      )
    }, { immediate: true });
  } catch {
    // Verification stays unverified; the operator can retry by toggling the model off and on.
  }
}

export function addModelById(id, value) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record || record.catalogState === 'loading') return;
  const next = addManualModel(record, value);
  if (next === record) return;
  patchConnector(id, next);
}
