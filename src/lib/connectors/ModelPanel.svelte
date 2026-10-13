<script>
  import { Button, Input, Switch } from '$goldfin/lib/index.js';
  import { isCatalogEditable } from './models.js';
  import { addModelById, discoverModelsById, isModelVerifying, setModelEnabled } from './store.svelte.js';

  let { record } = $props();
  let manualId = $state('');
  const models = $derived(record.models ?? []);
  const enabledCount = $derived(models.filter(model => model.enabled).length);
  const editable = $derived(isCatalogEditable(record));
  const catalogBusy = $derived(record.catalogState === 'loading');

  /** @param {{ source?: string, verified?: boolean }} model */
  function sourceLabel(model) {
    if (model.source === 'sample') return 'Sample';
    if (model.source === 'manual' && !model.verified) return 'Unverified';
    if (model.source === 'manual') return 'Manual';
    return 'Discovered';
  }

  function addModel(event) {
    event.preventDefault();
    addModelById(record.id, manualId);
    manualId = '';
  }
</script>

<section class="model-panel modal" aria-labelledby="model-panel-title" aria-busy={catalogBusy}>
  <header class="model-panel-head">
    <h2 id="model-panel-title">Models</h2>
    <span class="model-panel-count">{enabledCount} enabled</span>
  </header>
  <p class="model-panel-notice" role="status">
    {record.catalogMessage || 'Connection changed. Discover models again before enabling them.'}
  </p>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scroll region needs keyboard access.) -->
  <div class="model-list" role="region" aria-label="Model list" tabindex="0">
    <table class="model-table" aria-label="Models">
      <thead><tr><th scope="col">Model</th><th scope="col" class="model-toggle-column">Active</th></tr></thead>
      <tbody>
      {#each models as model (model.id)}
        <tr>
          <th scope="row">
            <span class="model-name">{model.id}</span>
            <span class="model-source">{sourceLabel(model)}{isModelVerifying(record.id, model.id) ? ' · Verifying…' : ''}</span>
          </th>
          <td class="model-toggle-cell">
            <Switch size="sm" label={model.id} checked={model.enabled}
                    disabled={!editable || catalogBusy || isModelVerifying(record.id, model.id)}
                    onCheckedChange={checked => setModelEnabled(record.id, model.id, checked)} />
          </td>
        </tr>
      {:else}
        <tr><td colspan="2" class="model-empty">No models added.</td></tr>
      {/each}
      </tbody>
    </table>
  </div>
  <form class="model-manual" onsubmit={addModel}>
    <Input label="Model ID" bind:value={manualId} placeholder="Type an ID, then press Enter" disabled={record.catalogState === 'loading'} />
  </form>
  <footer class="model-panel-foot">
    <Button type="button" disabled={record.catalogState === 'loading'} onclick={() => discoverModelsById(record.id)}>Refresh catalog</Button>
  </footer>
</section>

<style>
  .model-panel {
    flex: 1 1 300px;
    min-inline-size: 0;
    inline-size: auto;
    max-block-size: none;
    max-height: none;
    display: flex;
    flex-direction: column;
    padding: 18px;
    gap: 12px;
    overflow-wrap: anywhere;
  }
  .model-panel-head { display: grid; gap: 4px; }
  h2 { margin: 0; font: 700 15px/1.35 var(--font-ui); color: var(--ufg); }
  .model-panel-count, .model-source { font-size: 13px; color: var(--ufg2); }
  .model-panel-notice, .model-empty { margin: 0; font-size: 13px; line-height: 1.6; }
  .model-panel-notice { padding: 10px 12px; background: var(--uwell); border-radius: 7px; }
  .model-list { overflow-y: auto; max-block-size: 200px; min-block-size: 0; overscroll-behavior: contain; scrollbar-gutter: stable; scrollbar-color: var(--ufg3) var(--uwell); }
  .model-list:focus-visible { outline: 2px solid var(--key); outline-offset: 2px; }
  .model-table { inline-size: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0; font-size: 13px; line-height: 1.3; }
  .model-table th, .model-table td { text-align: start; vertical-align: middle; padding-block: 5px; padding-inline: 8px; border-block-end: 1px solid var(--urunline); }
  .model-table thead th { position: sticky; inset-block-start: 0; background: var(--urun); color: var(--ufg2); font-weight: 600; z-index: 1; }
  .model-table tbody th { font-weight: 500; }
  .model-name { display: block; color: var(--ufg); overflow-wrap: anywhere; }
  .model-source { display: block; }
  .model-toggle-column { inline-size: 56px; }
  .model-toggle-cell :global(.ctl) { display: flex; justify-content: end; align-items: center; min-inline-size: 0; }
  .model-toggle-cell :global(.field-content) { position: absolute; inline-size: 1px; block-size: 1px; overflow: clip; clip-path: inset(50%); }
  @media (hover: hover) and (pointer: fine) { .model-table tbody tr:hover > * { background: var(--hover); } }
  @media (pointer: coarse) { .model-table th, .model-table td { padding-block: 13px; } }
  .model-manual { display: grid; gap: 10px; }
  .model-panel-foot { display: grid; }
  .model-panel-foot :global(.btn) { justify-self: start; }
  @media (prefers-reduced-motion: no-preference) {
    .model-panel { opacity: 1; transform: translateX(0); transition: opacity var(--duration-menu) var(--ease-out), transform var(--duration-menu) var(--ease-out); }
    @starting-style { .model-panel { opacity: 0; transform: translateX(-12px); } }
  }
</style>
