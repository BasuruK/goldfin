<script lang="ts">
  import { Icon } from '$goldfin/lib/index.js';
  import { providerByType } from './providers.js';
  import type { SavedConnector } from './api.js';

  let { connector }: { connector: SavedConnector } = $props();

  const provider = $derived(providerByType(connector.providerType));

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
</article>
