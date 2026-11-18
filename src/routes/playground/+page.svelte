<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    Button,
    CopyButton,
    FileDrop,
    Section,
    Spinner,
    Select,
    Switch
  } from '$goldfin/lib/index.js';
  import ConnectorDialog from '#lib/connectors/ConnectorDialog.svelte';
  import { connectorStore, openAddDialog } from '#lib/connectors/store.svelte.js';
  import { enabledModelIds } from '#lib/llm/api.ts';
  import {
    clearLlmResult,
    disposeLlm,
    llmStore,
    loadLlmConnectors,
    runLlm,
    selectLlmConnector,
    stopLlm
  } from '#lib/llm/store.svelte.js';
  import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, validateDocument } from '#lib/ocr/documents.js';
  import {
    analyzeDocument,
    disposePlayground,
    downloadExtraction,
    loadOcrConnectors,
    playgroundStore,
    stopAnalyze
  } from '#lib/ocr/store.svelte.js';
  import { loadPromptList, promptStore } from '#lib/prompts/store.svelte.js';

  const NO_PROMPT_VALUE = '';
  const EMPTY_LLM_HINT =
    'No text extracted — switch on Full output to inspect the response.';

  let promptSelectValue = $state(NO_PROMPT_VALUE);
  let lastLlmConnectorId = $state('');

  onMount(() => {
    void loadOcrConnectors();
    void loadLlmConnectors();
    void loadPromptList();
  });

  onDestroy(() => {
    connectorStore.saveNotice = '';
    disposePlayground();
    disposeLlm();
  });

  const connectorItems = $derived(
    playgroundStore.connectors.map(c => ({ value: c.id, label: c.name || c.baseUrl }))
  );

  $effect(() => {
    if (connectorStore.saveNotice) {
      void loadOcrConnectors();
      void loadLlmConnectors();
    }
  });

  $effect(() => {
    if (playgroundStore.busy) return;
    const file = playgroundStore.document;
    playgroundStore.documentError = file ? (validateDocument(file) ?? '') : '';
  });

  $effect(() => {
    llmStore.promptId = promptSelectValue === NO_PROMPT_VALUE ? null : promptSelectValue;
  });

  function resetLlmWhenOcrInputChanges(connectorId: string, document: File | null): void {
    void connectorId;
    void document;
    clearLlmResult();
  }

  $effect(() => {
    resetLlmWhenOcrInputChanges(playgroundStore.connectorId, playgroundStore.document);
  });

  $effect(() => {
    if (playgroundStore.extraction === null) clearLlmResult();
  });

  $effect(() => {
    const connectorId = llmStore.connectorId;
    if (connectorId === lastLlmConnectorId) return;
    lastLlmConnectorId = connectorId;
    if (connectorId) selectLlmConnector(connectorId);
  });

  const probeBusy = $derived(playgroundStore.busy || llmStore.busy);

  const analyzeDisabled = $derived(
    probeBusy
    || !playgroundStore.connectorId
    || !playgroundStore.document
    || Boolean(playgroundStore.documentError)
  );

  const extractionText = $derived(playgroundStore.extraction?.content ?? '');

  const llmConnectorItems = $derived(
    llmStore.connectors.map(c => ({ value: c.id, label: c.name || c.baseUrl }))
  );

  const llmModelItems = $derived(
    enabledModelIds(llmStore.connectors.find(c => c.id === llmStore.connectorId)).map(id => ({
      value: id,
      label: id
    }))
  );

  const promptItems = $derived([
    { value: NO_PROMPT_VALUE, label: 'No system instructions' },
    ...promptStore.prompts.map(p => ({ value: p.id, label: p.name }))
  ]);

  const llmRunDisabled = $derived(
    probeBusy
    || !extractionText.trim()
    || llmStore.listState !== 'loaded'
    || !llmStore.connectorId
    || !llmStore.modelId
  );

  const llmPaneText = $derived.by(() => {
    if (llmStore.error) return '';
    const result = llmStore.result;
    if (!result) return '';
    if (llmStore.showFullOutput) return result.fullOutput;
    if (!result.content.trim()) return EMPTY_LLM_HINT;
    return result.content;
  });

  const llmStoppedLabel = $derived(
    llmStore.result?.stopped ? `Stopped early: ${llmStore.result.stopped}` : ''
  );

  const llmPromptLabel = $derived(
    llmStore.result
      ? (llmStore.result.promptVersion
        ? `Prompt v${llmStore.result.promptVersion.version}`
        : 'No prompt')
      : ''
  );

  function formatTokenCount(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : String(value);
  }

  const llmUsageLine = $derived.by(() => {
    const usage = llmStore.result?.usage;
    if (!usage) return '';
    return `Input ${formatTokenCount(usage.inputTokens)} · Output ${formatTokenCount(usage.outputTokens)} · Total ${formatTokenCount(usage.totalTokens)}`;
  });
</script>

<svelte:head>
  <title>OCR Playground · Goldfin</title>
</svelte:head>

<div class="playground-page">
  <header class="playground-head od-field">
    <h1 class="page-title">OCR Playground</h1>
    <p class="page-lead">
      Run one Document through a saved Azure Document Intelligence Connector and inspect the extracted text.
    </p>
  </header>

  {#if connectorStore.saveNotice}
    <p class="note" role="status">{connectorStore.saveNotice}</p>
  {/if}

  {#if playgroundStore.listState === 'loading' || playgroundStore.listState === 'idle'}
    <Section title="Connectors" id="playground-loading">
      <p class="note" role="status">Loading Azure OCR Connectors…</p>
    </Section>
  {:else if playgroundStore.listState === 'failed'}
    <Section title="Connectors unavailable" id="playground-failed">
      <p class="note" role="alert">{playgroundStore.listError}</p>
      <Button type="button" onclick={() => loadOcrConnectors()}>Retry</Button>
    </Section>
  {:else if playgroundStore.connectors.length === 0}
    <Section title="No Azure OCR Connectors" id="playground-empty">
      <p class="note">
        Save an Azure Document Intelligence Connector, then return here to analyze a Document.
      </p>
      <div class="playground-empty-actions">
        <Button type="button" class="primary" onclick={() => openAddDialog()}>Add connector</Button>
        <a class="btn" href="/connectors/">Open Connectors</a>
      </div>
    </Section>
  {:else}
    <div class="playground-controls">
      <Select
        label="Connector"
        items={connectorItems}
        bind:value={playgroundStore.connectorId}
        disabled={probeBusy}
      />
      <FileDrop
        bind:file={playgroundStore.document}
        accept={DOCUMENT_ACCEPT}
        label="Document"
        name="Select a document"
        disabled={probeBusy}
        description={`PDF, JPEG, PNG, or DOCX · up to ${Math.round(MAX_DOCUMENT_BYTES / 1_000_000)} MB`}
      />
      {#if playgroundStore.documentError}
        <p class="note error" role="alert">{playgroundStore.documentError}</p>
      {/if}
    </div>

    <div class="playground-actions">
      <Button type="button" disabled={!playgroundStore.busy} onclick={() => stopAnalyze()}>Stop</Button>
      <Button
        type="button"
        class="primary"
        disabled={analyzeDisabled}
        aria-busy={playgroundStore.busy}
        onclick={() => analyzeDocument()}
      >
        {playgroundStore.busy ? 'Analyzing…' : 'Analyze'}
      </Button>
    </div>

    {#if playgroundStore.stoppedNotice}
      <p class="note" role="status">{playgroundStore.stoppedNotice}</p>
    {/if}
    {#if playgroundStore.error}
      <p class="note error" role="alert">{playgroundStore.error}</p>
    {/if}

    <Section title="Extraction" id="playground-extraction">
      <div class="playground-extraction">
        <dl class="playground-stats">
          <div>
            <dt>Status</dt>
            <dd>{playgroundStore.statusLabel}{playgroundStore.statusHint ? ` — ${playgroundStore.statusHint}` : ''}</dd>
          </div>
          <div>
            <dt>Document</dt>
            <dd>{playgroundStore.extraction?.sourceName ?? '—'}</dd>
          </div>
          <div>
            <dt>Pages</dt>
            <dd>{playgroundStore.extraction ? playgroundStore.extraction.pages : 0}</dd>
          </div>
          <div>
            <dt>Characters</dt>
            <dd>{playgroundStore.extraction ? playgroundStore.extraction.characters.toLocaleString() : '0'}</dd>
          </div>
          <div>
            <dt>Elapsed</dt>
            <dd>{playgroundStore.extraction ? `${playgroundStore.extraction.elapsedSeconds}s` : '0s'}</dd>
          </div>
        </dl>

        <div class="playground-output" aria-busy={playgroundStore.busy}>
          {#if playgroundStore.busy}
            <div class="playground-busy" role="status">
              <Spinner tone="key" label="Running OCR" />
              <span>Running OCR…</span>
            </div>
          {/if}
          <pre class="playground-text">{extractionText}</pre>
        </div>

        {#if playgroundStore.extraction}
          <div class="playground-export">
            <CopyButton text={extractionText} label="Copy text" />
            <Button
              type="button"
              onclick={() => downloadExtraction()}
            >
              Download .txt
            </Button>
          </div>
        {/if}
      </div>
    </Section>

    <Section title="LLM extraction" id="playground-llm">
      {#if llmStore.listState === 'loading' || llmStore.listState === 'idle'}
        <p class="note" role="status">Loading LLM Connectors…</p>
      {:else if llmStore.listState === 'failed'}
        <p class="note error" role="alert">{llmStore.listError}</p>
        <Button type="button" onclick={() => loadLlmConnectors()}>Retry</Button>
      {:else if llmStore.connectors.length === 0}
        <p class="note">
          Save an LLM Connector, then return here to run the extraction through a Prompt.
        </p>
        <div class="playground-empty-actions">
          <Button type="button" class="primary" onclick={() => openAddDialog()}>Add connector</Button>
          <a class="btn" href="/connectors/">Open Connectors</a>
        </div>
      {:else}
        <div class="playground-llm">
          <div class="playground-controls">
            <Select
              label="Connector"
              items={llmConnectorItems}
              bind:value={llmStore.connectorId}
              disabled={probeBusy}
            />
            <Select
              label="Model"
              items={llmModelItems}
              bind:value={llmStore.modelId}
              disabled={probeBusy || llmModelItems.length === 0}
            />
            <Select
              label="Prompt"
              items={promptItems}
              bind:value={promptSelectValue}
              disabled={probeBusy || promptStore.listState === 'loading'}
            />
          </div>

          <div class="playground-actions">
            <Button type="button" disabled={!llmStore.busy} onclick={() => stopLlm()}>Stop</Button>
            <Button
              type="button"
              class="primary"
              disabled={llmRunDisabled}
              aria-busy={llmStore.busy}
              onclick={() => runLlm(extractionText)}
            >
              {llmStore.busy ? 'Running…' : 'Run'}
            </Button>
          </div>

          {#if llmStore.stoppedNotice}
            <p class="note" role="status">{llmStore.stoppedNotice}</p>
          {/if}
          {#if llmStore.error}
            <p class="note error" role="alert">{llmStore.error}</p>
          {/if}

          <Switch
            label="Full output"
            description="Show the raw provider response"
            bind:checked={llmStore.showFullOutput}
            disabled={!llmStore.result || probeBusy}
          />

          <div class="playground-output" aria-busy={llmStore.busy}>
            {#if llmStore.busy}
              <div class="playground-busy" role="status">
                <Spinner tone="key" label="Running LLM" />
                <span>Running LLM…</span>
              </div>
            {/if}
            <pre class="playground-text">{llmPaneText}</pre>
          </div>

          {#if llmStore.result}
            <div class="playground-llm-meta">
              {#if llmStoppedLabel}
                <p class="note" role="status">{llmStoppedLabel}</p>
              {/if}
              <p class="playground-llm-detail">{llmPromptLabel}</p>
              {#if llmUsageLine}
                <p class="playground-llm-detail">{llmUsageLine}</p>
              {/if}
            </div>
            <CopyButton text={llmPaneText} label="Copy text" />
          {/if}
        </div>
      {/if}
    </Section>
  {/if}
</div>

<ConnectorDialog />

<style>
  .playground-page {
    display: grid;
    gap: 24px;
  }

  .playground-controls {
    display: grid;
    gap: 16px;
    max-inline-size: 520px;
  }

  .playground-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: flex-end;
  }

  .playground-empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .playground-extraction,
  .playground-llm {
    display: grid;
    gap: 16px;
  }

  .playground-llm-meta {
    display: grid;
    gap: 4px;
  }

  .playground-llm-detail {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ufg2);
  }

  .playground-stats {
    display: grid;
    gap: 8px;
  }

  .playground-stats div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .playground-stats dt {
    margin: 0;
    color: var(--ufg3);
    font-size: 13px;
  }

  .playground-stats dd {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ufg);
  }

  .playground-busy {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--ufg2);
  }

  .playground-output {
    display: flex;
    flex-direction: column;
    gap: 12px;
    position: relative;
    border: 1px solid var(--uline);
    border-radius: 8px;
    background: var(--usurf);
    min-block-size: 12rem;
    padding: 16px;
  }

  .playground-text {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.55;
    color: var(--ufg);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .playground-export {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
  }

  .note.error {
    color: var(--bad);
  }
</style>
