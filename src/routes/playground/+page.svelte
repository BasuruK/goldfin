<script>
  import { onDestroy, onMount } from 'svelte';
  import {
    Button,
    CopyButton,
    FileDrop,
    Section,
    Spinner,
    Select
  } from '$goldfin/lib/index.js';
  import ConnectorDialog from '#lib/connectors/ConnectorDialog.svelte';
  import { connectorStore, openAddDialog } from '#lib/connectors/store.svelte.js';
  import { DOCUMENT_ACCEPT, MAX_DOCUMENT_BYTES, validateDocument } from '#lib/ocr/documents.js';
  import {
    analyzeDocument,
    disposePlayground,
    downloadExtraction,
    loadOcrConnectors,
    playgroundStore,
    stopAnalyze
  } from '#lib/ocr/store.svelte.js';

  onMount(() => {
    void loadOcrConnectors();
  });

  onDestroy(() => {
    disposePlayground();
  });

  const connectorItems = $derived(
    playgroundStore.connectors.map(c => ({ value: c.id, label: c.name || c.baseUrl }))
  );

  $effect(() => {
    if (connectorStore.saveNotice) void loadOcrConnectors();
  });

  $effect(() => {
    if (playgroundStore.busy) return;
    const file = playgroundStore.document;
    playgroundStore.documentError = file ? (validateDocument(file) ?? '') : '';
  });

  const analyzeDisabled = $derived(
    playgroundStore.busy
    || !playgroundStore.connectorId
    || !playgroundStore.document
    || Boolean(playgroundStore.documentError)
  );

  const extractionText = $derived(playgroundStore.extraction?.content ?? '');
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
        disabled={playgroundStore.busy}
      />
      <FileDrop
        bind:file={playgroundStore.document}
        accept={DOCUMENT_ACCEPT}
        label="Document"
        name="Select a document"
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
              <Spinner tone="running" label="Running OCR" />
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

  .playground-extraction {
    display: grid;
    gap: 16px;
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
    color: var(--bad, #e85d5d);
  }
</style>
