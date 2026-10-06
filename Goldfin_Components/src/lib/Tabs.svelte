<script>
  import { Tabs as Primitive } from 'bits-ui';
  let { value = $bindable(''), items, label = 'Views' } = $props();
  const active = $derived(value || items[0]?.value);
</script>
<Primitive.Root bind:value={() => active, next => { if (next) value = next; }}>
  <Primitive.List class="tabs" aria-label={label}>
    {#each items as item (item.value)}<Primitive.Trigger class={['tab', active === item.value && 'active']} value={item.value} disabled={item.disabled}>{item.label}</Primitive.Trigger>{/each}
  </Primitive.List>
  {#each items as item (item.value)}
    <Primitive.Content value={item.value} class="gf-tab-content">{#if item.content}{item.content}{/if}{#if item.children}{@render item.children()}{/if}</Primitive.Content>
  {/each}
</Primitive.Root>

<style>
  /* Every class here is handed to a bits-ui part, so the compiler never sees it.
     :global() is required; a plain selector would be pruned as unused. */
  :global(.tabs) { display: flex; gap: 0; border-bottom: 1px solid var(--uline); }
  :global(.tab) { height: 38px; margin: 0 18px -1px 0; padding: 0 4px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ufg3); font: 700 15px 'Urbanist', sans-serif; cursor: pointer; }
  :global(.tab[aria-selected="true"]) { border-bottom-color: var(--ufg); color: var(--ufg); }
  :global(.tab:hover) { color: var(--ufg); }
  :global(.gf-tab-content) { padding-block: 16px; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
</style>