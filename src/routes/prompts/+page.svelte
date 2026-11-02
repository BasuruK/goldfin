<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Button, Input, Section, Select } from '$goldfin/lib/index.js';
  import {
    disposePromptsPage,
    getPromptSelectItems,
    loadPromptList,
    markPromptDirty,
    promptStore,
    savePrompt,
    selectPrompt
  } from '#lib/prompts/store.svelte.js';

  let selectionReady = $state(false);

  onMount(() => {
    void loadPromptList().then(() => {
      selectionReady = true;
    });
  });

  onDestroy(() => {
    disposePromptsPage();
  });

  const selectItems = $derived(getPromptSelectItems());
  const saveDisabled = $derived(promptStore.saving || promptStore.listState === 'failed');

  $effect(() => {
    if (!selectionReady) return;
    selectPrompt(promptStore.selection);
  });
</script>

<svelte:head>
  <title>Prompts · Goldfin</title>
</svelte:head>

<div class="prompts-page">
  <header class="prompts-head od-field">
    <h1 class="page-title">Prompts</h1>
    <p class="page-lead">Save system instructions and select them on LLM nodes.</p>
  </header>

  {#if promptStore.listState === 'loading' || promptStore.listState === 'idle'}
    <Section title="Prompts" id="prompts-loading">
      <p class="note" role="status">Loading Prompts…</p>
    </Section>
  {:else if promptStore.listState === 'failed'}
    <Section title="Prompts unavailable" id="prompts-failed">
      <p class="note" role="alert">{promptStore.listError}</p>
      <Button type="button" onclick={() => loadPromptList()}>Retry</Button>
    </Section>
  {:else}
    <form
      class="prompt-form"
      onsubmit={(event) => {
        event.preventDefault();
        void savePrompt();
      }}
    >
      <div class="prompt-toolbar">
        <Select
          label="Saved prompt"
          items={selectItems}
          bind:value={promptStore.selection}
          disabled={promptStore.saving}
        />
        <Input
          label="Prompt name"
          maxlength={80}
          required
          bind:value={promptStore.name}
          disabled={promptStore.saving}
          oninput={() => markPromptDirty()}
        />
        <Button type="submit" class="primary prompt-save" disabled={saveDisabled}>
          {promptStore.saving ? 'Saving…' : 'Save prompt'}
        </Button>
      </div>

      <Section title="Prompt content" id="prompt-content">
        <label class="prompt-editor-label" for="prompt-content-field">System instructions</label>
        <textarea
          id="prompt-content-field"
          class="prompt-editor"
          spellcheck="false"
          placeholder="Write system instructions in Markdown…"
          bind:value={promptStore.content}
          disabled={promptStore.saving}
          oninput={() => markPromptDirty()}
        ></textarea>
      </Section>

      {#if promptStore.saveError}
        <p class="note error" role="alert">{promptStore.saveError}</p>
      {/if}
      <p class="note" role="status">{promptStore.statusMessage}</p>
    </form>
  {/if}
</div>

<style>
  .prompts-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-inline-size: 960px;
  }

  .prompts-head {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .prompt-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .prompt-toolbar {
    display: grid;
    gap: var(--space-4);
  }

  @media (min-width: 768px) {
    .prompt-toolbar {
      grid-template-columns: minmax(12rem, 1fr) minmax(12rem, 1fr) auto;
      align-items: end;
    }
  }

  .prompt-editor-label {
    display: block;
    margin-block-end: var(--space-2);
    font-size: var(--text-sm);
    color: var(--tx-2);
  }

  .prompt-editor {
    inline-size: 100%;
    min-block-size: 20rem;
    padding: var(--space-4);
    font: 12px/1.7 var(--mono);
    color: var(--tx-2);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--r);
    resize: vertical;
  }

  .prompt-editor:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .prompt-save {
    align-self: start;
  }
</style>
