<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    Button,
    ConfirmDialog,
    FileDrop,
    Icon,
    Input,
    Pill,
    RunButton,
    Section,
    Select,
    Spinner
  } from '$goldfin/lib/index.js';
  import { DOCUMENT_ACCEPT, validateDocument } from '#lib/ocr/documents.js';
  import DagView from '#lib/workflows/DagView.svelte';
  import WorkflowNodeCard from '#lib/workflows/WorkflowNodeCard.svelte';
  import { sinkNodeIds } from '#lib/workflows/graph.ts';
  import {
    addWorkflowNode,
    disposeWorkflowsPage,
    loadWorkflowPage,
    deleteSelectedWorkflow,
    runWorkflowProbeFromStore,
    saveWorkflowDraft,
    selectWorkflow,
    setWorkflowName,
    startNewWorkflow,
    workflowStore,
    workflowSelectItems
  } from '#lib/workflows/store.svelte.js';

  const NEW_VALUE = '__new__';

  onMount(() => {
    void loadWorkflowPage();
  });

  onDestroy(() => {
    disposeWorkflowsPage();
  });

  const selectValue = $derived(workflowStore.selection ?? NEW_VALUE);
  const selectItems = $derived([
    { value: NEW_VALUE, label: 'New workflow' },
    ...workflowSelectItems()
  ]);

  function selectWorkflowValue(value: string): void {
    if (value === NEW_VALUE) startNewWorkflow();
    else selectWorkflow(value);
  }

  function providerType(connectorId: string): string | undefined {
    return workflowStore.connectors.find(connector => connector.id === connectorId)?.providerType;
  }

  const sinks = $derived(workflowStore.draft ? sinkNodeIds(workflowStore.draft.nodes) : {});

  const documentValidation = $derived(
    workflowStore.probeDocument ? validateDocument(workflowStore.probeDocument) : null
  );

  const probeDisabled = $derived(
    workflowStore.probeBusy
    || !workflowStore.draft?.workflowId
    || !workflowStore.probeDocument
    || documentValidation !== null
    || workflowStore.saving
  );

  $effect(() => {
    const file = workflowStore.probeDocument;
    workflowStore.probeResult = null;
    if (!file) {
      workflowStore.probeError = '';
      return;
    }
    workflowStore.probeError = validateDocument(file) ?? '';
  });
</script>

<svelte:head>
  <title>Workflows · Goldfin</title>
</svelte:head>

<div class="workflows-page">
  <header class="workflows-head od-field">
    <h1 class="page-title">Workflows</h1>
    <p class="page-lead">Wire saved Connectors into a directed graph, save it, and run a Probe over one Document.</p>
  </header>

  {#if workflowStore.listState === 'loading' || workflowStore.listState === 'idle'}
    <Section title="Workflows" id="workflows-loading">
      <p class="note" role="status">Loading Workflows…</p>
    </Section>
  {:else if workflowStore.listState === 'failed'}
    <Section title="Workflows unavailable" id="workflows-failed">
      <p class="note" role="alert">{workflowStore.listError}</p>
      <Button type="button" onclick={() => loadWorkflowPage()}>Retry</Button>
    </Section>
  {:else}
    <div class="workflows-toolbar">
      {#key `${selectValue}-${workflowStore.workflows.length}`}
        <Select
          label="Saved workflow"
          items={selectItems}
          bind:value={() => selectValue, selectWorkflowValue}
          disabled={workflowStore.saving || workflowStore.probeBusy}
        />
      {/key}
      <Button
        type="button"
        class="primary"
        disabled={workflowStore.saving || workflowStore.probeBusy}
        onclick={() => startNewWorkflow()}
      >
        <Icon name="branch" size={16} />
        New workflow
      </Button>
    </div>

    {#if workflowStore.saveNotice}
      <p class="note" role="status">{workflowStore.saveNotice}</p>
    {/if}

    {#if workflowStore.draft}
      <form
        class="workflow-form"
        onsubmit={(event) => {
          event.preventDefault();
          void saveWorkflowDraft();
        }}
      >
        <Input
          label="Workflow name"
          maxlength={80}
          required
          bind:value={() => workflowStore.draft?.name ?? '', setWorkflowName}
          disabled={workflowStore.saving || workflowStore.probeBusy}
        />

        <Section title="Graph" id="workflow-graph">
          {#if workflowStore.draft.nodes.length === 0}
            <p class="note">Add nodes to build the Workflow.</p>
          {:else}
            <DagView nodes={workflowStore.draft.nodes} {providerType} />
          {/if}
        </Section>

        <div class="workflow-nodes-head">
          <h2 class="workflow-section-title">Nodes</h2>
          <Button
            type="button"
            disabled={workflowStore.saving || workflowStore.probeBusy}
            onclick={() => addWorkflowNode()}
          >
            Add node
          </Button>
        </div>

        <div class="workflow-nodes">
          {#each workflowStore.draft.nodes as node (node.id)}
            <WorkflowNodeCard {node} />
          {/each}
        </div>

        <div class="workflow-actions">
          <Button type="submit" class="primary" disabled={workflowStore.saving || workflowStore.probeBusy}>
            {workflowStore.saving ? 'Saving…' : 'Save workflow'}
          </Button>
          {#if workflowStore.selection}
            <ConfirmDialog
              trigger="Delete workflow"
              title="Delete this Workflow?"
              description="This removes the saved Workflow. Connectors and Prompts stay."
              action="Delete"
              tone="bad"
              icon="trash"
              onConfirm={() => deleteSelectedWorkflow()}
            />
          {/if}
        </div>

        {#if workflowStore.saveError}
          <p class="note error" role="alert">{workflowStore.saveError}</p>
        {/if}
      </form>

      <Section title="Workflow Probe" id="workflow-probe">
        <FileDrop
          bind:file={workflowStore.probeDocument}
          accept={DOCUMENT_ACCEPT}
          label="Document"
          name="Select a document"
          disabled={workflowStore.probeBusy}
        />
        {#if workflowStore.probeError}
          <p class="note error" role="alert">{workflowStore.probeError}</p>
        {/if}
        <RunButton
          label={workflowStore.probeBusy ? 'Running…' : 'Run Probe'}
          disabled={probeDisabled}
          onRun={() => runWorkflowProbeFromStore()}
        />
        {#if workflowStore.probeBusy}
          <p class="note" role="status"><Spinner tone="key" label="Running Workflow Probe" /></p>
        {/if}
        {#if workflowStore.probeResult}
          <ol class="probe-results">
            {#each workflowStore.probeResult.nodes as item (item.nodeId)}
              <li class="probe-node" data-sink={sinks[item.nodeId] ? 'true' : 'false'}>
                <header class="probe-node-head">
                  <h3 class="probe-node-title">{item.nodeName}</h3>
                  <Pill variant={item.status === 'failed' ? 'missing' : item.status === 'incomplete' ? 'running-pill' : 'ok-pill'}>
                    {item.status}
                  </Pill>
                  {#if item.stopReason}
                    <Pill>{item.stopReason}</Pill>
                  {/if}
                  {#if item.promptVersion}
                    <span class="probe-meta">Prompt v{item.promptVersion}</span>
                  {/if}
                  <span class="probe-meta">{item.durationMs} ms</span>
                </header>
                {#if item.status === 'failed'}
                  <p class="note error" role="alert">{item.error}</p>
                {:else if item.text}
                  <pre class="probe-text">{item.text}</pre>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      </Section>
    {:else if workflowStore.workflows.length === 0}
      <Section title="No workflows yet" id="workflows-empty">
        <p class="note">Create a Workflow to wire OCR and LLM Connectors.</p>
      </Section>
    {/if}
  {/if}
</div>

<style>
  .workflows-page {
    display: grid;
    gap: 24px;
  }
  .workflows-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: end;
  }
  .workflow-form {
    display: grid;
    gap: 20px;
  }
  .workflow-nodes-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .workflow-section-title {
    margin: 0;
    font: 600 16px var(--font-ui);
    color: var(--ufg);
  }
  .workflow-nodes {
    display: grid;
    gap: 16px;
  }
  .workflow-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .probe-results {
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 12px;
  }
  .probe-node {
    padding: 12px;
    border: 1px solid var(--uline);
    border-radius: 8px;
    background: var(--usurf);
  }
  .probe-node[data-sink='true'] {
    border-color: var(--ok);
    box-shadow: 0 0 0 1px var(--okbg);
  }
  .probe-node-head {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .probe-node-title {
    margin: 0;
    font: 600 14px var(--font-ui);
    flex: 1 1 auto;
  }
  .probe-meta {
    font: 500 12px var(--font-mono);
    color: var(--ufg2);
  }
  .probe-text {
    margin: 8px 0 0;
    padding: 12px;
    border-radius: 6px;
    background: var(--uhead);
    font: 500 12.5px/1.45 var(--font-mono);
    white-space: pre-wrap;
    overflow-x: auto;
  }
</style>