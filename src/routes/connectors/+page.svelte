<script>
  import { Button, Icon, Section } from '$goldfin/lib/index.js';
  import ConnectorCard from '#lib/connectors/ConnectorCard.svelte';
  import ConnectorDialog from '#lib/connectors/ConnectorDialog.svelte';
  import { connectorStore, openAddDialog } from '#lib/connectors/store.svelte.js';
</script>

<svelte:head>
  <title>Connectors · Goldfin</title>
</svelte:head>

<div class="connectors-page">
  <header class="connectors-head od-field">
    <h1 class="page-title">Connectors</h1>
    <p class="page-lead">
      Registered LLM and HTTP endpoints. Each value you enter is saved on this device until the API
      ships.
    </p>
  </header>

  <div class="connectors-actions">
    <Button type="button" class="primary connectors-add" onclick={openAddDialog}>
      <Icon name="plug" size={16} />
      Add connector
    </Button>
  </div>

  {#if connectorStore.connectors.length === 0}
    <Section title="No connectors yet" id="connectors-empty">
      <p class="note">
        Add an OpenAI, Azure, OpenAI-compatible, or custom Web Request endpoint. You can run a
        connection check from the dialog; a full Connector check will run on the worker later.
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
