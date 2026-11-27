<script lang="ts">
  import { Button, ConfirmDialog, Icon } from '$goldfin/lib/index.js';
  import { providerByType } from './providers.js';
  import type { SavedConnector } from './api.js';
  import { openEditDialog, removeConnector } from './store.svelte.js';

  let { connector }: { connector: SavedConnector } = $props();

  const provider = $derived(providerByType(connector.providerType));
  const displayName = $derived(connector.name || provider.label);

  function hostFromUrl(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url || '—';
    }
  }
</script>

<article class="connector-card">
  <div class="connector-card-top">
    <span class="connector-card-icon" aria-hidden="true">
      <Icon name={provider.icon} size={20} />
    </span>
    <div class="connector-card-copy od-field">
      <h3 class="connector-card-title">{connector.name || provider.label}</h3>
      <p class="connector-card-desc od-clamp-2">{provider.description}</p>
    </div>
  </div>
  <dl class="connector-card-meta">
    <div>
      <dt>Host</dt>
      <dd>{hostFromUrl(connector.baseUrl)}</dd>
    </div>
    <div>
      <dt>Provider</dt>
      <dd>{provider.label}</dd>
    </div>
    <div>
      <dt>Credential</dt>
      <dd>{connector.credentialLabel ?? 'None'}</dd>
    </div>
  </dl>
  <div class="connector-card-foot">
    <Button type="button" class="connector-card-action" aria-label={`Edit ${displayName}`} onclick={() => openEditDialog(connector)}>
      Edit
    </Button>
    <ConfirmDialog
      trigger={`Delete ${displayName}`}
      title={`Delete ${displayName}?`}
      description="This removes the Connector. Workflows that use it must pick another Connector first."
      action="Delete"
      tone="bad"
      icon="trash"
      onConfirm={() => removeConnector(connector.id)}
    />
  </div>
</article>
