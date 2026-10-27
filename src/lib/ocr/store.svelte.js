import { ApiError, listConnectors } from '#lib/connectors/api.js';
import { AZURE_OCR_PROVIDER_TYPE } from '#lib/connectors/providers.js';
import { OcrError, submitOcr } from './api.js';
import { validateDocument } from './documents.js';

/** @typedef {import('#lib/connectors/api.js').SavedConnector} SavedConnector */
/** @typedef {{ content: string, pages: number, characters: number, elapsedSeconds: string, sourceName: string }} ExtractionView */

/**
 * @type {{
 *   connectors: SavedConnector[],
 *   listState: 'idle' | 'loading' | 'loaded' | 'failed',
 *   listError: string,
 *   connectorId: string,
 *   document: File | null,
 *   documentError: string,
 *   busy: boolean,
 *   statusLabel: string,
 *   statusHint: string,
 *   error: string,
 *   stoppedNotice: string,
 *   extraction: ExtractionView | null
 * }}
 */
export const playgroundStore = $state({
  connectors: [],
  listState: 'idle',
  listError: '',
  connectorId: '',
  document: null,
  documentError: '',
  busy: false,
  statusLabel: 'Idle',
  statusHint: 'Choose a Connector and Document.',
  error: '',
  stoppedNotice: '',
  extraction: null
});

let activeOperation = 0;
let listOperation = 0;
/** @type {AbortController | null} */
let abortController = null;
/** @type {number | null} */
let startedAt = null;
/** @type {ReturnType<typeof setInterval> | null} */
let elapsedTimer = null;

function clearElapsedTimer() {
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = null;
}

function resetBusyUi() {
  playgroundStore.busy = false;
  clearElapsedTimer();
  startedAt = null;
}

export async function loadOcrConnectors() {
  const operation = ++listOperation;
  playgroundStore.listState = 'loading';
  playgroundStore.listError = '';
  try {
    const all = await listConnectors();
    if (operation !== listOperation) return;

    playgroundStore.connectors = all.filter(c => c.providerType === AZURE_OCR_PROVIDER_TYPE);
    playgroundStore.listState = 'loaded';
    
    if (!playgroundStore.connectorId && playgroundStore.connectors[0]) {
      playgroundStore.connectorId = playgroundStore.connectors[0].id;
    } else if (
      playgroundStore.connectorId
      && !playgroundStore.connectors.some(c => c.id === playgroundStore.connectorId)
    ) {
      playgroundStore.connectorId = playgroundStore.connectors[0]?.id ?? '';
    }
  } catch (error) {
    if (operation !== listOperation) return;
    playgroundStore.listState = 'failed';
    playgroundStore.listError = error instanceof ApiError ? error.message : 'Could not load Connectors. Try again.';
  }
}

export function disposePlayground() {
  invalidateOperation();
  listOperation += 1;
  abortController?.abort();
  abortController = null;
  resetBusyUi();
  playgroundStore.document = null;
  playgroundStore.documentError = '';
  playgroundStore.error = '';
  playgroundStore.stoppedNotice = '';
  playgroundStore.extraction = null;
  playgroundStore.statusLabel = 'Idle';
  playgroundStore.statusHint = 'Choose a Connector and Document.';
}

function invalidateOperation() {
  activeOperation += 1;
}

function tickElapsed() {
  if (!startedAt || !playgroundStore.busy) return;
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  playgroundStore.statusHint = `${seconds}s elapsed`;
}

/**
 * @param {number} operation
 * @returns {boolean}
 */
function isStale(operation) {
  return operation !== activeOperation;
}

export async function analyzeDocument() {
  if (playgroundStore.busy) return;
  playgroundStore.error = '';
  playgroundStore.stoppedNotice = '';
  const docError = playgroundStore.document ? validateDocument(playgroundStore.document) : 'Choose a PDF, JPEG, PNG, or DOCX file.';
  if (docError) {
    playgroundStore.documentError = docError;
    return;
  }
  if (!playgroundStore.connectorId) {
    playgroundStore.error = 'Choose an Azure OCR Connector.';
    return;
  }
  const document = playgroundStore.document;
  if (!document) return;

  const operation = ++activeOperation;
  abortController?.abort();
  abortController = new AbortController();
  playgroundStore.extraction = null;
  playgroundStore.busy = true;
  playgroundStore.statusLabel = 'Running';
  playgroundStore.statusHint = 'Submitting Document…';
  startedAt = Date.now();
  clearElapsedTimer();
  elapsedTimer = setInterval(tickElapsed, 100);

  try {
    const result = await submitOcr(playgroundStore.connectorId, document, abortController.signal);
    if (isStale(operation)) return;
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    playgroundStore.extraction = {
      content: result.content,
      pages: result.pages,
      characters: result.content.length,
      elapsedSeconds,
      sourceName: document.name
    };
    playgroundStore.statusLabel = 'Succeeded';
    playgroundStore.statusHint = `${result.pages} ${result.pages === 1 ? 'page' : 'pages'}`;
    resetBusyUi();
  } catch (error) {
    if (isStale(operation)) return;
    resetBusyUi();
    playgroundStore.statusLabel = 'Failed';
    playgroundStore.statusHint = 'See the message below.';
    playgroundStore.error = error instanceof OcrError ? error.message : 'Could not run OCR. Try again.';
  } finally {
    if (!isStale(operation)) abortController = null;
  }
}

export function stopAnalyze() {
  if (!playgroundStore.busy) return;
  invalidateOperation();
  abortController?.abort();
  abortController = null;
  resetBusyUi();
  playgroundStore.statusLabel = 'Stopped';
  playgroundStore.statusHint = 'Browser request aborted';
  playgroundStore.stoppedNotice = 'Stopped locally. Azure may still process a submitted operation.';
}

export function downloadExtraction() {
  const content = playgroundStore.extraction?.content;
  if (!content) return;
  const baseName = playgroundStore.extraction?.sourceName ?? 'document';
  const stem = baseName.replace(/\.(pdf|jpe?g|png|docx)$/i, '') || 'document';
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${stem}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}
