import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import type { SavedConnector } from '../../src/lib/connectors/api.ts';
// Compiled at runtime so Node can execute Svelte runes outside the browser.
import { loadLlmStoreModule, type LlmStoreTestModule } from './_compile-store.ts';

const connector = (): SavedConnector => ({
  id: 'c1',
  name: 'Fixture',
  providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  llmApiMode: 'responses',
  models: [{ id: 'model-a', enabled: true }]
});

const validBody = {
  content: 'parsed',
  fullOutput: '{"ok":true}',
  stopped: '',
  promptVersion: null,
  usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
};

function jsonResponse() {
  return {
    ok: true,
    status: 200,
    async json() {
      return validBody;
    }
  };
}

let storeModule: LlmStoreTestModule;

beforeEach(async () => {
  storeModule = await loadLlmStoreModule();
  storeModule.disposeLlm();
  storeModule.llmStore.connectors = [connector()];
  storeModule.llmStore.connectorId = 'c1';
  storeModule.llmStore.modelId = 'model-a';
});

afterEach(() => mock.restoreAll());

function primeRunInput(): void {
  storeModule.llmStore.connectorId = 'c1';
  storeModule.llmStore.modelId = 'model-a';
}

test('stopLlm cancels a busy run without surfacing fetch cancel as an error', async () => {
  let rejectAbort: (error: Error) => void;
  mock.method(globalThis, 'fetch', () =>
    new Promise((_, reject) => {
      rejectAbort = reject;
    })
  );

  const run = storeModule.runLlm('ocr text');
  assert.equal(storeModule.llmStore.busy, true);
  storeModule.stopLlm();
  rejectAbort!(new DOMException('The operation was aborted.', 'AbortError'));
  await run;

  assert.equal(storeModule.llmStore.busy, false);
  assert.equal(storeModule.llmStore.result, null);
  assert.equal(storeModule.llmStore.error, '');
  assert.match(storeModule.llmStore.stoppedNotice, /Stopped locally/);
});

test('a stale completion does not overwrite state after stopLlm', async () => {
  let resolveFirst: (value: ReturnType<typeof jsonResponse>) => void;
  let calls = 0;
  mock.method(globalThis, 'fetch', () => {
    calls += 1;
    if (calls === 1) {
      return new Promise(resolve => {
        resolveFirst = resolve;
      });
    }
    return Promise.resolve(jsonResponse());
  });

  primeRunInput();
  const first = storeModule.runLlm('first');
  assert.equal(storeModule.llmStore.busy, true);
  storeModule.stopLlm();

  primeRunInput();
  const second = storeModule.runLlm('second');
  await second;
  resolveFirst!(jsonResponse());
  await first;

  assert.equal(storeModule.llmStore.result?.content, 'parsed');
  assert.equal(calls, 2);
});

test('clearLlmResult clears output fields without touching showFullOutput', () => {
  storeModule.llmStore.result = {
    content: 'x',
    fullOutput: '{}',
    stopped: '',
    promptVersion: null,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null }
  };
  storeModule.llmStore.error = 'failed';
  storeModule.llmStore.stoppedNotice = 'stopped';
  storeModule.llmStore.showFullOutput = true;

  storeModule.clearLlmResult();

  assert.equal(storeModule.llmStore.result, null);
  assert.equal(storeModule.llmStore.error, '');
  assert.equal(storeModule.llmStore.stoppedNotice, '');
  assert.equal(storeModule.llmStore.showFullOutput, true);
});

test('disposeLlm resets session-only showFullOutput', () => {
  storeModule.llmStore.showFullOutput = true;
  storeModule.disposeLlm();
  assert.equal(storeModule.llmStore.showFullOutput, false);
});
