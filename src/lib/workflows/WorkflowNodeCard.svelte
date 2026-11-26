<script lang="ts">
  import { Button, Icon, Input, Select } from '$goldfin/lib/index.js';
  import { enabledModelIds } from '../llm/api.ts';
  import { connectorShowsModels, nodeKindForProvider, type WorkflowNodeDraft } from './api.ts';
  import {
    connectorSelectItems,
    moveNodeInput,
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

  {#if showInputs && upstreamItems.length > 0}
    <fieldset class="wf-inputs">
      <legend class="label">Upstream inputs</legend>
      <p class="field-desc">Fan-in order sets the heading sequence for LLM input.</p>
      <ul class="wf-input-list">
        {#each upstreamItems as item (item.value)}
          {@const checked = node.inputNodeIds.includes(item.value)}
          <li class="wf-input-row">
            <label class="wf-input-check">
              <input
                type="checkbox"
                checked={checked}
                disabled={workflowStore.saving || workflowStore.probeBusy}
                onchange={(event) => toggleNodeInput(node.id, item.value, event.currentTarget.checked)}
              />
              <span>{item.label}</span>
            </label>
            {#if checked && reorderVisible}
              <span class="wf-input-actions">
                <Button
                  type="button"
                  class="icon"
                  aria-label={`Move ${item.label} up in input order`}
                  disabled={workflowStore.saving || workflowStore.probeBusy || inputOrder.indexOf(item.value) === 0}
                  onclick={() => moveNodeInput(node.id, item.value, 'up')}
                >
                  <Icon name="chevron" size={14} />
                </Button>
                <Button
                  type="button"
                  class="icon"
                  aria-label={`Move ${item.label} down in input order`}
                  disabled={
                    workflowStore.saving
                    || workflowStore.probeBusy
                    || inputOrder.indexOf(item.value) === inputOrder.length - 1
                  }
                  onclick={() => moveNodeInput(node.id, item.value, 'down')}
                >
                  <Icon name="chevron" size={14} />
                </Button>
              </span>
            {/if}
          </li>
        {/each}
      </ul>
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
  .wf-input-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .wf-input-check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--ufg);
  }
  .wf-input-actions {
    display: inline-flex;
    gap: 4px;
  }
  .wf-input-actions :global(.btn.icon:last-child) :global(.lin) {
    transform: rotate(180deg);
  }
</style>