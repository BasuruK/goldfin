import { applyConnectorPatch, addManualModel, isCatalogEditable } from './models.ts';
import {
  AZURE_OCR_PROVIDER_TYPE,
  DEFAULT_AZURE_OCR_API_VERSION,
  DEFAULT_PROVIDER_TYPE,
  defaultBaseUrlFor,
  defaultNameFor,
  isSavableProvider,
  type ProviderType
} from './providers.ts';
import { clearLegacyConnectors, createEmptyConnector, type ConnectorRecord } from './storage.ts';
import { ApiError, createConnector, listConnectors, validateDraft, type SavedConnector } from './api.ts';

export type SaveErrorField = 'name' | 'baseUrl' | 'credential' | 'credentialLabel';

export interface ConnectorStoreState {
  connectors: SavedConnector[];
  listState: 'idle' | 'loading' | 'loaded' | 'failed';
  listError: string;
  dialogOpen: boolean;
  draft: ConnectorRecord | null;
  saving: boolean;
  saveError: string;
  saveErrorField: SaveErrorField | null;
  saveNotice: string;
}

clearLegacyConnectors();

export const connectorStore = $state<ConnectorStoreState>({
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
  connectorStore.saving = false;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
  connectorStore.saveNotice = '';
  connectorStore.dialogOpen = true;
}

export function closeDialog(): void {
  connectorStore.dialogOpen = false;
  connectorStore.draft = null;
  connectorStore.saving = false;
  connectorStore.saveError = '';
  connectorStore.saveErrorField = null;
}

/** Leaving the page drops the draft and the notice. */
export function disposeConnectorsPage(): void {
  closeDialog();
  connectorStore.saveNotice = '';
}

export function patchDraft(patch: Partial<ConnectorRecord>): void {
  const draft = connectorStore.draft;
  if (!draft) return;
  connectorStore.draft = { ...applyConnectorPatch(draft, patch), updatedAt: new Date().toISOString() };
  // The draft calls the Credential field `apiKey`; validation calls it `credential`.
  const errorField =
    connectorStore.saveErrorField === 'credential' ? 'apiKey' : connectorStore.saveErrorField;
  if (errorField && errorField in patch) {
    connectorStore.saveError = '';
    connectorStore.saveErrorField = null;
  }
}

export function setDraftProviderType(providerType: ProviderType): void {
  const draft = connectorStore.draft;
  if (!draft || draft.providerType === providerType) return;
  const wasDefault = draft.baseUrl === defaultBaseUrlFor(draft.providerType);
  patchDraft({
    providerType,
    name: draft.name === defaultNameFor(draft.providerType) ? defaultNameFor(providerType) : draft.name,
    baseUrl: wasDefault || !draft.baseUrl.trim() ? defaultBaseUrlFor(providerType) : draft.baseUrl,
    apiVersion: providerType === AZURE_OCR_PROVIDER_TYPE ? DEFAULT_AZURE_OCR_API_VERSION : ''
  });
}

export async function saveDraft(): Promise<void> {
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
    apiVersion:
      draft.providerType === AZURE_OCR_PROVIDER_TYPE
        ? draft.apiVersion.trim() || DEFAULT_AZURE_OCR_API_VERSION
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
    connectorStore.saveError =
      error instanceof ApiError ? error.message : 'Could not save the Connector. Try again.';
  }
}

export function setDraftModelEnabled(modelId: string, enabled: boolean): void {
  const draft = connectorStore.draft;
  if (!draft || !isCatalogEditable(draft)) return;
  connectorStore.draft = {
    ...draft,
    models: (draft.models ?? []).map(model => (model.id === modelId ? { ...model, enabled } : model))
  };
}

export function addDraftModel(value: string): void {
  const draft = connectorStore.draft;
  if (!draft) return;
  const next = addManualModel(draft, value);
  if (next !== draft) connectorStore.draft = next;
}
