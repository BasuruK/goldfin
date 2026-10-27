import { applyConnectorPatch, beginDiscovery, finishDiscovery, addManualModel, isCatalogEditable } from './models.js';
import {
  AZURE_OCR_PROVIDER_TYPE,
  DEFAULT_AZURE_OCR_API_VERSION,
  DEFAULT_PROVIDER_TYPE,
  defaultBaseUrlFor,
  defaultNameFor,
  isSavableProvider
} from './providers.js';
import { clearLegacyConnectors, createEmptyConnector } from './storage.js';
import { previewModelCatalog } from './model-preview.js';
import { ApiError, createConnector, listConnectors, validateDraft } from './api.js';

/** @typedef {import('./storage.js').ConnectorRecord} ConnectorRecord */
/** @typedef {import('./providers.js').ProviderType} ProviderType */
/** @typedef {import('./api.js').SavedConnector} SavedConnector */

clearLegacyConnectors();

/**
 * @type {{
 *   connectors: SavedConnector[],
 *   listState: 'idle' | 'loading' | 'loaded' | 'failed',
 *   listError: string,
 *   dialogOpen: boolean,
 *   draft: ConnectorRecord | null,
 *   saving: boolean,
 *   saveError: string,
 *   saveErrorField: 'name' | 'baseUrl' | 'credential' | 'credentialLabel' | null,
 *   saveNotice: string
 * }}
 */
export const connectorStore = $state({
  connectors: [],
  listState: 'idle',
  listError: '',
  dialogOpen: false,
  draft: null,
  saving: false,
  saveError: '',
  saveErrorField: null,
  saveNotice: ''
});

export async function loadConnectorList() {
  connectorStore.listState = 'loading';
  connectorStore.listError = '';
  try {
    connectorStore.connectors = await listConnectors();
    connectorStore.listState = 'loaded';
  } catch (error) {
    connectorStore.listState = 'failed';
    connectorStore.listError = error instanceof ApiError ? error.message : 'Could not load Connectors. Try again.';
  }
}

export function openAddDialog() {
  const draft = createEmptyConnector(DEFAULT_PROVIDER_TYPE);
  draft.name = defaultNameFor(DEFAULT_PROVIDER_TYPE);
  draft.baseUrl = defaultBaseUrlFor(DEFAULT_PROVIDER_TYPE);
  connectorStore.draft = draft;
  connectorStore.saving = false;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  connectorStore.saveNotice = '';
  connectorStore.dialogOpen = true;
}

export function closeDialog() {
  connectorStore.dialogOpen = false;
  connectorStore.draft = null;
  connectorStore.saving = false;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
}

/** Leaving the page drops the draft and the notice. */
export function disposeConnectorsPage() {
  closeDialog();
  connectorStore.saveNotice = '';
}

/** @param {Partial<ConnectorRecord>} patch */
export function patchDraft(patch) {
  const draft = connectorStore.draft;
  if (!draft) return;
  connectorStore.draft = { ...applyConnectorPatch(draft, patch), updatedAt: new Date().toISOString() };
  // The draft calls the Credential field `apiKey`; validation calls it `credential`.
  const errorField = connectorStore.saveErrorField === 'credential' ? 'apiKey' : connectorStore.saveErrorField;
  if (errorField && errorField in patch) {
    connectorStore.saveError = '';
    connectorStore.saveErrorField = null;
  }
}

/** @param {ProviderType} providerType */
export function setDraftProviderType(providerType) {
  const draft = connectorStore.draft;
  if (!draft || draft.providerType === providerType) return;
  const wasDefault = draft.baseUrl === defaultBaseUrlFor(draft.providerType);
  patchDraft({
    providerType,
    name: draft.name === defaultNameFor(draft.providerType) ? defaultNameFor(providerType) : draft.name,
    baseUrl: wasDefault || !draft.baseUrl.trim() ? defaultBaseUrlFor(providerType) : draft.baseUrl,
    apiVersion: providerType === 'azure_document_intelligence' ? DEFAULT_AZURE_OCR_API_VERSION : ''
  });
}

export async function saveDraft() {
  const draft = connectorStore.draft;
  if (!draft || connectorStore.saving) return;
  if (!isSavableProvider(draft.providerType)) {
    connectorStore.saveError = 'Saving is not available for this provider yet.';
    connectorStore.saveErrorField = null;
    return;
  }
  const request = {
    name: draft.name,
    providerType: draft.providerType,
    baseUrl: draft.baseUrl,
    apiVersion: draft.providerType === 'azure_document_intelligence'
      ? (draft.apiVersion.trim() || DEFAULT_AZURE_OCR_API_VERSION)
      : undefined,
    credential: draft.apiKey,
    credentialLabel: draft.credentialLabel
  };
  const invalid = validateDraft(request);
  if (invalid) {
    connectorStore.saveError = invalid.message;
    connectorStore.saveErrorField = invalid.field;
    return;
  }
  connectorStore.saving = true;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  // A reply that lands after Cancel must not touch a dialog reopened for another draft.
  const stillOpen = () => connectorStore.draft?.id === draft.id;
  try {
    const saved = await createConnector(request);
    // The Connector exists either way, so it is listed even if the dialog was cancelled.
    connectorStore.connectors = [...connectorStore.connectors, saved];
    if (!stillOpen()) return;
    closeDialog();
    connectorStore.saveNotice = `${saved.name} is saved.`;
  } catch (error) {
    if (!stillOpen()) return;
    connectorStore.saving = false;
    connectorStore.saveError = error instanceof ApiError ? error.message : 'Could not save the Connector. Try again.';
  }
}

export async function previewDraftModels() {
  const draft = connectorStore.draft;
  if (!draft) return;
  const loading = beginDiscovery(draft);
  connectorStore.draft = loading;
  /** @type {import('./models.js').CatalogResult} */
  let result;
  try {
    result = await previewModelCatalog(draft.providerType);
  } catch {
    result = { state: 'failed', message: 'Could not load the preview. Try again.' };
  }
  const current = connectorStore.draft;
  if (!current || current.id !== draft.id) return;
  const finished = finishDiscovery(current, loading.discoveryRevision, result);
  if (finished !== current) connectorStore.draft = finished;
}

/** @param {string} modelId @param {boolean} enabled */
export function setDraftModelEnabled(modelId, enabled) {
  const draft = connectorStore.draft;
  if (!draft || !isCatalogEditable(draft)) return;
  connectorStore.draft = {
    ...draft,
    models: (draft.models ?? []).map(model => (model.id === modelId ? { ...model, enabled } : model))
  };
}

/** @param {string} value */
export function addDraftModel(value) {
  const draft = connectorStore.draft;
  if (!draft || draft.catalogState === 'loading') return;
  const next = addManualModel(draft, value);
  if (next !== draft) connectorStore.draft = next;
}
