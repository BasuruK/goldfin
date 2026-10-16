import { applyConnectorPatch, beginDiscovery, finishDiscovery, addManualModel, isCatalogEditable } from './models.js';
import { DEFAULT_PROVIDER_TYPE, defaultBaseUrlFor, defaultNameFor } from './providers.js';
import { clearLegacyData, createEmptyConnector, hasLegacyData } from './storage.js';
import { previewModelCatalog } from './model-preview.js';
import {
  SaveAttemptError,
  createSaveAttempt,
  listConnectors,
  pollSaveAttempt,
  validateSaveDraft
} from './save-attempts.js';

/** @typedef {import('./storage.js').ConnectorRecord} ConnectorRecord */
/** @typedef {import('./providers.js').ProviderType} ProviderType */
/** @typedef {import('./save-attempts.js').SavedConnector} SavedConnector */

const FAILURE_MESSAGES = {
  unreachable: 'The worker could not reach this endpoint. Check the Base URL, then try again.',
  timeout: 'The check timed out before the endpoint answered. Try again.'
};

/** @type {AbortController | null} */
let saveController = null;
let saveToken = 0;
let listToken = 0;

/**
 * @type {{
 *   connectors: SavedConnector[],
 *   listState: 'idle' | 'loading' | 'loaded' | 'failed',
 *   listError: string,
 *   dialogOpen: boolean,
 *   draft: ConnectorRecord | null,
 *   saveState: 'idle' | 'queued' | 'running' | 'finished',
 *   saveError: string,
 *   saveErrorField: 'name' | 'baseUrl' | 'credentialLabel' | null,
 *   saveNotice: string,
 *   legacyPresent: boolean,
 *   legacyError: string
 * }}
 */
export const connectorStore = $state({
  connectors: [],
  listState: 'idle',
  listError: '',
  dialogOpen: false,
  draft: null,
  saveState: 'idle',
  saveError: '',
  saveErrorField: null,
  saveNotice: '',
  legacyPresent: hasLegacyData(),
  legacyError: ''
});

export async function loadConnectorList() {
  const token = ++listToken;
  connectorStore.listState = 'loading';
  connectorStore.listError = '';
  try {
    const connectors = await listConnectors();
    if (token !== listToken) return;
    connectorStore.connectors = connectors;
    connectorStore.listState = 'loaded';
  } catch (error) {
    if (token !== listToken) return;
    connectorStore.listState = 'failed';
    connectorStore.listError =
      error instanceof SaveAttemptError ? error.message : 'Could not load Connectors. Try again.';
  }
}

export function openAddDialog() {
  const draft = createEmptyConnector(DEFAULT_PROVIDER_TYPE);
  draft.name = defaultNameFor(DEFAULT_PROVIDER_TYPE);
  draft.baseUrl = defaultBaseUrlFor(DEFAULT_PROVIDER_TYPE);
  connectorStore.draft = draft;
  connectorStore.saveState = 'idle';
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  connectorStore.saveNotice = '';
  connectorStore.dialogOpen = true;
}

function abortSave() {
  saveToken += 1;
  saveController?.abort();
  saveController = null;
}

export function closeDialog() {
  abortSave();
  connectorStore.dialogOpen = false;
  connectorStore.draft = null;
  connectorStore.saveState = 'idle';
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
}

/** Leaving the page disposes in-flight work; late replies cannot mutate state. */
export function disposeConnectorsPage() {
  closeDialog();
  listToken += 1;
  connectorStore.saveNotice = '';
}

/** @param {Partial<ConnectorRecord>} patch */
export function patchDraft(patch) {
  const draft = connectorStore.draft;
  if (!draft) return;
  connectorStore.draft = { ...applyConnectorPatch(draft, patch), updatedAt: new Date().toISOString() };
  if (connectorStore.saveErrorField && connectorStore.saveErrorField in patch) {
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
    baseUrl: wasDefault || !draft.baseUrl.trim() ? defaultBaseUrlFor(providerType) : draft.baseUrl
  });
}

export async function saveDraft() {
  const draft = connectorStore.draft;
  if (!draft || connectorStore.saveState === 'queued' || connectorStore.saveState === 'running') return;
  if (draft.providerType !== 'web_request') {
    connectorStore.saveError = 'Saving is not available for this provider yet. Only Web Request Connectors can be saved.';
    connectorStore.saveErrorField = null;
    return;
  }
  const invalid = validateSaveDraft({
    name: draft.name,
    providerType: draft.providerType,
    baseUrl: draft.baseUrl,
    credential: draft.apiKey,
    credentialLabel: draft.credentialLabel
  });
  if (invalid) {
    connectorStore.saveError = invalid.message;
    connectorStore.saveErrorField = invalid.field;
    return;
  }

  const token = ++saveToken;
  const controller = new AbortController();
  saveController = controller;
  connectorStore.saveState = 'queued';
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  try {
    const created = await createSaveAttempt(
      {
        name: draft.name,
        providerType: draft.providerType,
        baseUrl: draft.baseUrl,
        credential: draft.apiKey,
        credentialLabel: draft.credentialLabel
      },
      { signal: controller.signal }
    );
    if (token !== saveToken) return;
    const finished = await pollSaveAttempt(created.id, {
      signal: controller.signal,
      onUpdate: attempt => {
        if (token === saveToken) connectorStore.saveState = attempt.state;
      }
    });
    if (token !== saveToken) return;
    connectorStore.saveState = 'finished';
    if (finished.finding) {
      connectorStore.saveNotice =
        `Reachable (${finished.finding.httpStatus}, ${finished.finding.latencyMs}ms). ${draft.name.trim()} is saved.`;
      // Close before refreshing: no window where the committed draft looks editable.
      closeDialog();
      await loadConnectorList();
    } else {
      // A failed check keeps the draft editable so it can be corrected and retried.
      connectorStore.saveState = 'idle';
      const code = finished.failureCode ?? '';
      connectorStore.saveError = Object.hasOwn(FAILURE_MESSAGES, code)
        ? FAILURE_MESSAGES[/** @type {keyof typeof FAILURE_MESSAGES} */ (code)]
        : 'The check failed. Review the Connector details, then try again.';
    }
  } catch (error) {
    if (token !== saveToken || (error instanceof Error && error.name === 'AbortError')) return;
    connectorStore.saveState = 'idle';
    connectorStore.saveError =
      error instanceof SaveAttemptError ? error.message : 'Could not save the Connector. Try again.';
  } finally {
    if (saveController === controller) saveController = null;
  }
}

export function clearLegacyConnectors() {
  if (!clearLegacyData()) {
    connectorStore.legacyError = 'Could not clear the legacy data. Try again.';
    return;
  }
  connectorStore.legacyPresent = hasLegacyData();
  connectorStore.legacyError = connectorStore.legacyPresent
    ? 'Could not clear the legacy data. Try again.'
    : '';
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
