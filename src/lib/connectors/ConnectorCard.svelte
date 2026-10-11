<script>
  import { Button, Chip, Icon } from '$goldfin/lib/index.js';
  import ConfigureIcon from './ConfigureIcon.svelte';
  import DeleteConnectorConfirm from './DeleteConnectorConfirm.svelte';
  import { openEditDialog } from './store.svelte.js';
  import { providerByType } from './providers.js';

  /** @type {{ connector: import('./storage.js').ConnectorRecord }} */
  let { connector } = $props();

  const provider = $derived(providerByType(connector.providerType));

  const statusChip = $derived.by(() => {
    switch (connector.connectionStatus) {
      case 'ok':
        return { tone: 'ok', label: 'Connected' };
      case 'failed':
        return { tone: 'error', label: 'Check failed' };
      case 'testing':
        return { tone: 'running', label: 'Checking…' };
      default:
        return { tone: 'stopped', label: 'Not checked' };
    }
  });

  function hostFromUrl(url) {
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
    <DeleteConnectorConfirm {connector} iconTrigger trigger="Delete connector" />
  </div>
  <div class="connector-card-status">
    <Chip tone={statusChip.tone}>{statusChip.label}</Chip>
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
  </dl>
  <div class="connector-card-foot">
    <Button type="button" class="connector-card-action" onclick={() => openEditDialog(connector.id)}>
      <ConfigureIcon size={16} />
      Configure
    </Button>
  </div>
</article>
