<script lang="ts">
  import { Button, Icon, Input, Select } from '$goldfin/lib/index.js';
  import { enabledModelIds } from '../llm/api.ts';
  import { connectorShowsModels, nodeKindForProvider, type WorkflowNodeDraft } from './api.ts';
  import {
    connectorSelectItems,
    moveNodeInput,
    nodeLabel,
    patchWorkflowNode,
    promptSelectItems,
    removeWorkflowNode,
    toggleNodeInput,
    upstreamCandidates,
    workflowStore
  } from './store.svelte.js';

  let { node }: { node: WorkflowNodeDraft } = $props();

  const connector = $derived(workflowStore.connectors.find(entry => entry.id === node.connectorId));
  const kind = $derived(connector ? nodeKindForProvider(connector.providerType) : null);
  const showModels = $derived(connector ? connectorShowsModels(connector.providerType) : false);
  const showPrompt = $derived(kind === 'llm');
  const showInputs = $derived(kind === 'llm');

  const connectorItems = $derived(connectorSelectItems());
  const modelItems = $derived(
    enabledModelIds(connector).map(id => ({ value: id, label: id }))
  );
  const promptItems = $derived(promptSelectItems());
  const upstreamItems = $derived(upstreamCandidates(node.id));
  const inputOrder = $derived(node.inputNodeIds);
  const reorderVisible = $derived(inputOrder.length >= 2);
  const uncheckedUpstream = $derived(upstreamItems.filter(item => !inputOrder.includes(item.value)));
</script>

<article class="wf-node" aria-label={`Node ${node.name}`}>
  <header class="wf-node-head">
    <h3 class="wf-node-title">Node</h3>
    <Button
      type="button"
      class="icon"
      aria-label="Remove node"
      disabled={workflowStore.saving || workflowStore.probeBusy}
      onclick={() => removeWorkflowNode(node.id)}
    >
      <Icon name="trash" size={16} />
    </Button>
  </header>

  <Input
    label="Node name"
    maxlength={80}
    bind:value={() => node.name, (value: string) => patchWorkflowNode(node.id, { name: value })}
    disabled={workflowStore.saving || workflowStore.probeBusy}
  />

  <Select
    label="Connector"
    items={connectorItems}
    bind:value={() => node.connectorId, (value: string) => patchWorkflowNode(node.id, { connectorId: value })}
    disabled={workflowStore.saving || workflowStore.probeBusy || connectorItems.length === 0}
  />

  {#if showModels}
    <Select
      label="Model"
      items={modelItems}
      bind:value={() => node.modelId, (value: string) => patchWorkflowNode(node.id, { modelId: value })}
      disabled={workflowStore.saving || workflowStore.probeBusy || modelItems.length === 0}
    />
  {/if}

  {#if showPrompt}
    <Select
      label="Prompt"
      items={promptItems}
      bind:value={() => node.promptId, (value: string) => patchWorkflowNode(node.id, { promptId: value })}
      disabled={workflowStore.saving || workflowStore.probeBusy || promptItems.length === 0}
    />
  {/if}

  {#if showInputs && (inputOrder.length > 0 || uncheckedUpstream.length > 0)}
    <fieldset class="wf-inputs">
      <legend class="label">Upstream inputs</legend>
      <p class="field-desc">Fan-in order sets the heading sequence for LLM input.</p>
      {#if inputOrder.length > 0}
        <ul class="wf-input-list">
          {#each inputOrder as fromId, index (fromId)}
            <li class="wf-input-row">
              <span class="wf-input-order">#{index + 1}</span>
              <span class="wf-input-name">{nodeLabel(fromId)}</span>
              <label class="wf-input-check wf-sr-label">
                <input
                  type="checkbox"
                  checked={true}
                  disabled={workflowStore.saving || workflowStore.probeBusy}
                  onchange={() => toggleNodeInput(node.id, fromId, false)}
                />
                <span>Remove {nodeLabel(fromId)}</span>
              </label>
              {#if reorderVisible}
                <span class="wf-input-actions">
                  <Button
                    type="button"
                    class="icon wf-chevron-up"
                    aria-label={`Move ${nodeLabel(fromId)} up in input order`}
                    disabled={workflowStore.saving || workflowStore.probeBusy || index === 0}
                    onclick={() => moveNodeInput(node.id, fromId, 'up')}
                  >
                    <Icon name="chevron" size={14} />
                  </Button>
                  <Button
                    type="button"
                    class="icon"
                    aria-label={`Move ${nodeLabel(fromId)} down in input order`}
                    disabled={
                      workflowStore.saving
                      || workflowStore.probeBusy
                      || index === inputOrder.length - 1
                    }
                    onclick={() => moveNodeInput(node.id, fromId, 'down')}
                  >
                    <Icon name="chevron" size={14} />
                  </Button>
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if uncheckedUpstream.length > 0}
        <ul class="wf-input-list wf-input-pool">
          {#each uncheckedUpstream as item (item.value)}
            <li class="wf-input-row">
              <label class="wf-input-check">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={workflowStore.saving || workflowStore.probeBusy}
                  onchange={(event) => toggleNodeInput(node.id, item.value, event.currentTarget.checked)}
                />
                <span>{item.label}</span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </fieldset>
  {:else if showInputs}
    <p class="note">Add another node to wire upstream inputs.</p>
  {/if}
</article>

<style>
  .wf-node {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--uline);
    border-radius: 8px;
    background: var(--usurf);
  }
  .wf-node-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .wf-node-title {
    margin: 0;
    font: 600 14px var(--font-ui);
    color: var(--ufg);
  }
  .wf-inputs {
    margin: 0;
    padding: 0;
    border: 0;
    display: grid;
    gap: 8px;
  }
  .wf-input-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }
  .wf-input-pool {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--uline);
  }
  .wf-input-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    flex-wrap: wrap;
  }
  .wf-input-order {
    font: 600 11px var(--font-mono);
    color: var(--ufg2);
    min-inline-size: 1.75rem;
  }
  .wf-input-name {
    flex: 1 1 auto;
    font-size: 13px;
    color: var(--ufg);
  }
  .wf-input-check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ufg);
  }
  .wf-sr-label {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .wf-input-actions {
    display: inline-flex;
    gap: 4px;
    margin-inline-start: auto;
  }
  .wf-input-actions :global(.wf-chevron-up .lni) {
    transform: rotate(180deg);
  }
</style>