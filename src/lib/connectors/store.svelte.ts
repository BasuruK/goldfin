import { applyConnectorPatch, addManualModel, canToggleModel } from './models.ts';
import {
  AZURE_OCR_PROVIDER_TYPE,
  DEFAULT_AZURE_OCR_API_VERSION,
  DEFAULT_PROVIDER_TYPE,
  defaultBaseUrlFor,
  defaultLlmApiMode,
  defaultNameFor,
  type ProviderType
} from './providers.ts';
import { clearLegacyConnectors, createEmptyConnector, type ConnectorRecord } from './storage.ts';
import { ApiError } from '../request-core.ts';
import {
  createConnector,
  deleteConnector,
  listConnectors,
  planSave,
  updateConnector,
  type SaveErrorField,
  type SavePlan,
  type SavedConnector
} from './api.ts';

function clearModelsSaveError(): void {
  if (connectorStore.saveErrorField !== 'models') return;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
}

export interface ConnectorStoreState {
  connectors: SavedConnector[];
  listState: 'idle' | 'loading' | 'loaded' | 'failed';
  listError: string;
  dialogOpen: boolean;
  dialogMode: 'add' | 'edit';
  editingHasCredential: boolean;
  draft: ConnectorRecord | null;
  saving: boolean;
  saveError: string;
  saveErrorField: SaveErrorField | null;
  saveNotice: string;
  deleteError: string;
  deletingId: string | null;
  draftSession: number;
}

clearLegacyConnectors();

export const connectorStore = $state<ConnectorStoreState>({
  connectors: [],
  listState: 'idle',
  listError: '',
  dialogOpen: false,
  dialogMode: 'add',
  editingHasCredential: false,
  draft: null,
  saving: false,
  saveError: '',
  saveErrorField: null,
  saveNotice: '',
  deleteError: '',
  deletingId: null,
  draftSession: 0
});

function beginDraftSession(): void {
  connectorStore.draftSession += 1;
}

export async function loadConnectorList(): Promise<void> {
  connectorStore.listState = 'loading';
  connectorStore.listError = '';
  try {
    connectorStore.connectors = await listConnectors();
    connectorStore.listState = 'loaded';
  } catch (error) {
    connectorStore.listState = 'failed';
    connectorStore.listError =
      error instanceof ApiError ? error.message : 'Could not load Connectors. Try again.';
  }
}

export function openAddDialog(): void {
  const draft = createEmptyConnector(DEFAULT_PROVIDER_TYPE);
  draft.name = defaultNameFor(DEFAULT_PROVIDER_TYPE);
  draft.baseUrl = defaultBaseUrlFor(DEFAULT_PROVIDER_TYPE);
  connectorStore.draft = draft;
  connectorStore.dialogMode = 'add';
  connectorStore.editingHasCredential = false;
  connectorStore.saving = false;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  connectorStore.saveNotice = '';
  connectorStore.deleteError = '';
  beginDraftSession();
  connectorStore.dialogOpen = true;
}

export function openEditDialog(saved: SavedConnector): void {
  const draft = createEmptyConnector(saved.providerType as ProviderType);
  draft.id = saved.id;
  draft.name = saved.name;
  draft.baseUrl = saved.baseUrl;
  draft.apiVersion = saved.apiVersion ?? '';
  draft.llmApiMode = saved.llmApiMode
    ? (saved.llmApiMode as typeof draft.llmApiMode)
    : defaultLlmApiMode(saved.providerType as ProviderType);
  draft.credentialLabel = saved.credentialLabel ?? '';
  draft.apiKey = '';
  draft.models = (saved.models ?? []).map(model => ({
    id: model.id,
    enabled: model.enabled,
    source: 'manual' as const
  }));
  connectorStore.draft = draft;
  connectorStore.dialogMode = 'edit';
  connectorStore.editingHasCredential = Boolean(saved.credentialLabel || saved.credentialSetAt);
  connectorStore.saving = false;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  connectorStore.saveNotice = '';
  connectorStore.deleteError = '';
  beginDraftSession();
  connectorStore.dialogOpen = true;
}

export function closeDialog(): void {
  connectorStore.dialogOpen = false;
  connectorStore.draft = null;
  connectorStore.saving = false;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  beginDraftSession();
}

/** Leaving the page drops the draft and the notice. */
export function disposeConnectorsPage(): void {
  closeDialog();
  connectorStore.saveNotice = '';
  connectorStore.deleteError = '';
}

export function patchDraft(patch: Partial<ConnectorRecord>): void {
  const draft = connectorStore.draft;
  if (!draft) return;
  connectorStore.draft = applyConnectorPatch(draft, patch);
  // The draft calls the Credential field `apiKey`; validation calls it `credential`.
  const errorField =
    connectorStore.saveErrorField === 'credential' ? 'apiKey' : connectorStore.saveErrorField;
  if (errorField && errorField in patch) {
    connectorStore.saveError = '';
    connectorStore.saveErrorField = null;
  }
  if (connectorStore.saveErrorField === 'models' && ('providerType' in patch || 'baseUrl' in patch)) {
    clearModelsSaveError();
  }
}

export function setDraftProviderType(providerType: ProviderType): void {
  if (connectorStore.dialogMode === 'edit') return;
  const draft = connectorStore.draft;
  if (!draft || draft.providerType === providerType) return;
  const wasDefault = draft.baseUrl === defaultBaseUrlFor(draft.providerType);
  patchDraft({
    providerType,
    name: draft.name === defaultNameFor(draft.providerType) ? defaultNameFor(providerType) : draft.name,
    baseUrl: wasDefault || !draft.baseUrl.trim() ? defaultBaseUrlFor(providerType) : draft.baseUrl,
    apiVersion: providerType === AZURE_OCR_PROVIDER_TYPE ? DEFAULT_AZURE_OCR_API_VERSION : '',
    llmApiMode: defaultLlmApiMode(providerType)
  });
}

async function persistConnectorPlan(draft: ConnectorRecord, plan: SavePlan): Promise<SavedConnector> {
  switch (plan.kind) {
    case 'update':
      return updateConnector(draft.id, plan.request);
    case 'save':
      return createConnector(plan.request);
    default:
      throw new Error('Invalid Connector plan.');
  }
}

function replaceConnectorInList(saved: SavedConnector, created: boolean): void {
  connectorStore.connectors = created
    ? [...connectorStore.connectors, saved]
    : connectorStore.connectors.map(entry => (entry.id === saved.id ? saved : entry));
}

export async function saveDraft(): Promise<void> {
  const draft = connectorStore.draft;
  if (!draft || connectorStore.saving) return;
  const editing = connectorStore.dialogMode === 'edit';
  const plan = planSave(draft, {
    editing,
    hasStoredCredential: editing && connectorStore.editingHasCredential
  });
  if (plan.kind === 'invalid') {
    connectorStore.saveError = plan.message;
    connectorStore.saveErrorField = plan.field;
    return;
  }
  connectorStore.saving = true;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  const session = connectorStore.draftSession;
  const stillOpen = () => connectorStore.draftSession === session;
  try {
    const saved = await persistConnectorPlan(draft, plan);
    replaceConnectorInList(saved, plan.kind === 'save');
    if (!stillOpen()) return;
    closeDialog();
    connectorStore.deleteError = '';
    connectorStore.saveNotice = editing ? `${saved.name} is updated.` : `${saved.name} is saved.`;
  } catch (error) {
    if (!stillOpen()) return;
    connectorStore.saving = false;
    connectorStore.saveError =
      error instanceof ApiError ? error.message : 'Could not save the Connector. Try again.';
  }
}

export async function removeConnector(id: string): Promise<void> {
  if (connectorStore.deletingId) return;
  connectorStore.deletingId = id;
  connectorStore.deleteError = '';
  connectorStore.saveNotice = '';
  const name = connectorStore.connectors.find(connector => connector.id === id)?.name ?? 'Connector';
  try {
    await deleteConnector(id);
    connectorStore.connectors = connectorStore.connectors.filter(connector => connector.id !== id);
    connectorStore.saveNotice = `${name} is deleted.`;
  } catch (error) {
    connectorStore.deleteError =
      error instanceof ApiError ? error.message : 'Could not delete the Connector. Try again.';
  } finally {
    connectorStore.deletingId = null;
  }
}

export function setDraftModelEnabled(modelId: string, enabled: boolean): void {
  const draft = connectorStore.draft;
  if (!draft) return;
  const model = draft.models.find(entry => entry.id === modelId);
  if (!model || !canToggleModel(draft, model)) return;
  connectorStore.draft = {
    ...draft,
    models: draft.models.map(model => (model.id === modelId ? { ...model, enabled } : model))
  };
  clearModelsSaveError();
}

export function addDraftModel(value: string): void {
  const draft = connectorStore.draft;
  if (!draft) return;
  const next = addManualModel(draft, value);
  if (next !== draft) connectorStore.draft = next;
  clearModelsSaveError();
}
