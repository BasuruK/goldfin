<script>
  import { Icon } from '$goldfin/lib/index.js';
  import { providerByType } from './providers.js';

  /** @type {{ connector: import('./api.js').SavedConnector }} */
  let { connector } = $props();

  const provider = $derived(providerByType(/** @type {import('./providers.js').ProviderType} */ (connector.providerType)));

  /** @param {string} url */
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
