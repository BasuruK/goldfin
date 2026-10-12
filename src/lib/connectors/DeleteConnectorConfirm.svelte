<script>
  import { ConfirmDialog } from '$goldfin/lib/index.js';
  import { connectorStore, deleteConnector } from './store.svelte.js';
  import { providerByType } from './providers.js';

  /** @type {{ connector: import('./storage.js').ConnectorRecord, trigger?: string, iconTrigger?: boolean }} */
  let { connector, trigger = 'Delete', iconTrigger = false } = $props();

  const label = $derived(connector.name.trim() || providerByType(connector.providerType).label);
</script>

{#if !connectorStore.adding || connectorStore.editingId !== connector.id}
<ConfirmDialog
  {trigger}
  {iconTrigger}
  title="Delete {label}?"
  description="This removes the Connector. This cannot be undone."
  action="Delete"
  icon="trash"
  tone="bad"
  onConfirm={() => deleteConnector(connector.id)}
/>
{/if}
