<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Button, Input, Section, Select } from '$goldfin/lib/index.js';
  import {
    disposePromptsPage,
    getPromptSelectItems,
    getSelectedValue,
    loadPromptList,
    markPromptDirty,
    promptStore,
    savePrompt,
    selectPrompt,
    selectPromptValue
  } from '#lib/prompts/store.svelte.js';

  // Reload the selected Prompt on mount; after that only the Select's setter selects a Prompt.
  // A $effect here re-ran on every promptStore read and overwrote the save status.
  onMount(() => {
    void loadPromptList().then(() => {
      selectPrompt(promptStore.selection);
    });
  });

  onDestroy(() => {
    disposePromptsPage();
  });

  const selectItems = $derived(getPromptSelectItems());
  const saveDisabled = $derived(promptStore.saving || promptStore.listState === 'failed');
</script>

<svelte:head>
  <title>Prompts · Goldfin</title>
</svelte:head>

<div class="prompts-page">
  <header class="od-field">
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
          bind:value={getSelectedValue, selectPromptValue}
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
        <Button type="submit" class="primary" disabled={saveDisabled}>
          {promptStore.saving ? 'Saving…' : 'Save prompt'}
        </Button>
      </div>

      <Section title="Prompt content" id="prompt-content">
        <div class="field">
          <label class="label" for="prompt-content-field">System instructions</label>
          <textarea
            id="prompt-content-field"
            class="input prompt-editor"
            spellcheck="false"
            placeholder="Write system instructions in Markdown…"
            bind:value={promptStore.content}
            disabled={promptStore.saving}
            oninput={() => markPromptDirty()}
          ></textarea>
        </div>
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
    gap: 24px;
    max-inline-size: 960px;
  }

  .prompt-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .prompt-toolbar {
    display: grid;
    gap: 16px;
  }

  @media (min-width: 768px) {
    .prompt-toolbar {
      grid-template-columns: minmax(12rem, 1fr) minmax(12rem, 1fr) auto;
      align-items: end;
    }
  }

  /* `.input` gives the border, fill and focus ring; this makes it a tall editor. */
  .prompt-editor {
    block-size: auto;
    min-block-size: 20rem;
    padding: 16px;
    font: 12px/1.7 var(--font-mono);
    resize: vertical;
  }
</style>
