// ponytail: knip ignores this module until the playground page imports it (#168).
import { isLlmProvider, listConnectors, type SavedConnector } from '#lib/connectors/api.ts';
import { pickConnectorId } from '#lib/ocr/api.ts';
import { ApiError } from '#lib/request-core.ts';
import {
  enabledModelIds,
  mapLlmRunError,
  pickModelId,
  planLlmRun,
  submitLlm,
  type LlmResult
} from './api.ts';

interface LlmStoreState {
  connectors: SavedConnector[];
  listState: 'idle' | 'loading' | 'loaded' | 'failed';
  listError: string;
  connectorId: string;
  modelId: string;
  promptId: string | null;
  busy: boolean;
  error: string;
  stoppedNotice: string;
  result: LlmResult | null;
  showFullOutput: boolean;
}

export const llmStore = $state<LlmStoreState>({
  connectors: [],
  listState: 'idle',
  listError: '',
  connectorId: '',
  modelId: '',
  promptId: null,
  busy: false,
  error: '',
  stoppedNotice: '',
  result: null,
  showFullOutput: false
});

let activeOperation = 0;
let listOperation = 0;
let abortController: AbortController | null = null;

function selectedConnector(): SavedConnector | undefined {
  return llmStore.connectors.find(connector => connector.id === llmStore.connectorId);
}

function syncModelId(): void {
  llmStore.modelId = pickModelId(llmStore.modelId, enabledModelIds(selectedConnector()));
}

function resetBusy(): void {
  llmStore.busy = false;
}

export async function loadLlmConnectors(): Promise<void> {
  const operation = ++listOperation;
  llmStore.listState = 'loading';
  llmStore.listError = '';
  try {
    const all = await listConnectors();
    if (operation !== listOperation) return;

    llmStore.connectors = all.filter(connector => isLlmProvider(connector.providerType));
    llmStore.listState = 'loaded';
    llmStore.connectorId = pickConnectorId(llmStore.connectorId, llmStore.connectors);
    syncModelId();
  } catch (error) {
    if (operation !== listOperation) return;
    llmStore.listState = 'failed';
    llmStore.listError = error instanceof ApiError ? error.message : 'Could not load Connectors. Try again.';
  }
}

export function disposeLlm(): void {
  invalidateOperation();
  listOperation += 1;
  abortController?.abort();
  abortController = null;
  resetBusy();
  llmStore.error = '';
  llmStore.stoppedNotice = '';
  llmStore.result = null;
  llmStore.showFullOutput = false;
}

export function clearLlmResult(): void {
  llmStore.result = null;
  llmStore.error = '';
  llmStore.stoppedNotice = '';
}

function invalidateOperation(): void {
  activeOperation += 1;
}

function isStale(operation: number): boolean {
  return operation !== activeOperation;
}

export async function runLlm(input: string): Promise<void> {
  if (llmStore.busy) return;
  llmStore.error = '';
  llmStore.stoppedNotice = '';
  const plan = planLlmRun(input, llmStore.connectorId, llmStore.modelId, selectedConnector());
  if (plan.kind === 'invalid') {
    llmStore.error = plan.message;
    return;
  }

  const operation = ++activeOperation;
  abortController?.abort();
  abortController = new AbortController();
  llmStore.result = null;
  llmStore.busy = true;

  try {
    const result = await submitLlm(
      plan.connectorId,
      plan.modelId,
      llmStore.promptId,
      plan.input,
      abortController.signal
    );
    if (isStale(operation)) return;
    llmStore.result = result;
    resetBusy();
  } catch (error) {
    if (isStale(operation)) return;
    resetBusy();
    const message = mapLlmRunError(error);
    if (message !== null) llmStore.error = message;
  } finally {
    if (!isStale(operation)) abortController = null;
  }
}

export function stopLlm(): void {
  if (!llmStore.busy) return;
  invalidateOperation();
  abortController?.abort();
  abortController = null;
  resetBusy();
  llmStore.stoppedNotice = 'Stopped locally. The provider may still finish and bill.';
}
