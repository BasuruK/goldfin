<script>
  import { onDestroy, onMount } from 'svelte';
  import { Button, Icon, Section } from '$goldfin/lib/index.js';
  import ConnectorCard from '#lib/connectors/ConnectorCard.svelte';
  import ConnectorDialog from '#lib/connectors/ConnectorDialog.svelte';
  import {
    connectorStore,
    disposeConnectorsPage,
    loadConnectorList,
    openAddDialog
  } from '#lib/connectors/store.svelte.js';

  onMount(() => {
    void loadConnectorList();
  });

  onDestroy(() => {
    disposeConnectorsPage();
  });
</script>

<svelte:head>
  <title>Connectors · Goldfin</title>
</svelte:head>

<div class="connectors-page">
  <header class="connectors-head od-field">
    <h1 class="page-title">Connectors</h1>
    <p class="page-lead">
      Registered LLM and HTTP endpoints.
    </p>
  </header>

  <div class="connectors-actions">
    <Button type="button" class="primary connectors-add" onclick={openAddDialog}>
      <Icon name="plug" size={16} />
      Add connector
    </Button>
  </div>

  {#if connectorStore.saveNotice}
    <p class="note" role="status">{connectorStore.saveNotice}</p>
  {/if}

  {#if connectorStore.listState === 'loading' || connectorStore.listState === 'idle'}
    <Section title="Connectors" id="connectors-loading">
      <p class="note" role="status">Loading Connectors…</p>
    </Section>
  {:else if connectorStore.listState === 'failed'}
    <Section title="Connectors unavailable" id="connectors-failed">
      <p class="note" role="alert">{connectorStore.listError}</p>
      <Button type="button" onclick={() => loadConnectorList()}>Retry</Button>
    </Section>
  {:else if connectorStore.connectors.length === 0}
    <Section title="No connectors yet" id="connectors-empty">
      <p class="note">
        Add a Web Request or Azure Document Intelligence OCR Connector to get started.
      </p>
    </Section>
  {:else}
    <div class="connector-grid" role="list">
      {#each connectorStore.connectors as connector (connector.id)}
        <div role="listitem">
          <ConnectorCard {connector} />
        </div>
      {/each}
    </div>
  {/if}
</div>

<ConnectorDialog />
