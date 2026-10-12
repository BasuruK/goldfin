import { finishConnectionCheck, runConnectionCheck } from './connection-check.js';
import { defaultBaseUrlFor, defaultNameFor } from './providers.js';
import { createEmptyConnector, loadConnectors, saveConnectors } from './storage.js';
import { applyConnectorPatch, beginDiscovery, finishDiscovery, addManualModel } from './models.js';
import { previewModelCatalog } from './model-preview.js';

/** @typedef {import('./storage.js').ConnectorRecord} ConnectorRecord */
/** @typedef {import('./providers.js').ProviderType} ProviderType */

function persist(list) {
  saveConnectors(list);
}

function touch(record, patch) {
  return { ...applyConnectorPatch(record, patch), updatedAt: new Date().toISOString() };
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
}

/** @param {string} id */
export function removeDraftIfEmpty(id) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record) return;
  const hasContent =
    record.apiKey.trim() || record.baseUrl.trim() !== defaultBaseUrlFor(record.providerType);
  if (!hasContent && !record.name.trim()) {
    connectorStore.connectors = connectorStore.connectors.filter(c => c.id !== id);
    persist(connectorStore.connectors);
  }
}

/** @param {string} id @param {Partial<ConnectorRecord>} patch */
export function patchConnector(id, patch) {
  connectorStore.connectors = connectorStore.connectors.map(c =>
    c.id === id ? touch(c, patch) : c
  );
  persist(connectorStore.connectors);
}

/** @param {string} id @param {ProviderType} providerType */
export function setProviderType(id, providerType) {
  const current = connectorStore.connectors.find(c => c.id === id);
  if (!current) return;
  const wasDefault = current.baseUrl === defaultBaseUrlFor(current.providerType);
  patchConnector(id, {
    providerType,
    name: current.name === defaultNameFor(current.providerType) ? defaultNameFor(providerType) : current.name,
    baseUrl: wasDefault || !current.baseUrl.trim() ? defaultBaseUrlFor(providerType) : current.baseUrl,
    connectionStatus: 'idle',
    connectionMessage: ''
  });
}

/** @param {string} id */
export function deleteConnector(id) {
  connectorStore.connectors = connectorStore.connectors.filter(c => c.id !== id);
  persist(connectorStore.connectors);
  if (connectorStore.editingId === id) {
    closeDialog();
  }
}

/** @param {string} id */
export async function testConnectorById(id) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record) return;
  const requestId = crypto.randomUUID();

  patchConnector(id, { connectionStatus: 'testing', connectionMessage: 'Checking…', checkRequestId: requestId });
  const result = await runConnectionCheck({
    baseUrl: record.baseUrl,
    apiKey: record.apiKey,
    providerType: record.providerType
  });
  const current = connectorStore.connectors.find(c => c.id === id);
  const finished = finishConnectionCheck(current, requestId, result, new Date().toISOString());
  if (finished !== current) patchConnector(id, finished);
}

export async function previewModelsById(id) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record) return;
  const loading = beginDiscovery(record);
  patchConnector(id, loading);
  let result;
  try {
    result = await previewModelCatalog(record.providerType);
  } catch {
    result = { state: 'failed', message: 'Could not load the preview. Try again.' };
  }
  const current = connectorStore.connectors.find(c => c.id === id);
  if (!current) return;
  const finished = finishDiscovery(current, loading.discoveryRevision, result);
  if (finished !== current) patchConnector(id, finished);
}

export function setModelEnabled(id, modelId, enabled) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record || !['ready', 'unsupported'].includes(record.catalogState)) return;
  patchConnector(id, {
    models: (record.models ?? []).map(model => model.id === modelId ? { ...model, enabled } : model)
  });
}

export function addModelById(id, value) {
  const record = connectorStore.connectors.find(c => c.id === id);
  if (!record || record.catalogState === 'loading') return;
  patchConnector(id, addManualModel(record, value));
}
