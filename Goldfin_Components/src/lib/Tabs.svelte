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
  :global(.tabs) {
    display: flex;
    gap: 0;
    border-block-end: 1px solid var(--uline);
    /* `safe center` keeps the row centred while it fits and pins it to the
       readable edge rather than overflowing when it does not. */
    justify-content: safe center;
  }
  :global(.tab) {
    flex: none;
    height: 38px;
    margin-inline-end: 18px;
    /* The -1px pulls the active underline over the row border so the two read
       as one line. It cannot move into `margin-block` alone: the row border
       sits at the container's bottom edge. */
    margin-block-end: -1px;
    padding: 0 4px;
    border: 0;
    border-block-end: 2px solid transparent;
    background: transparent;
    color: var(--ufg3);
    font: 700 15px var(--font-ui);
    white-space: nowrap;
    cursor: pointer;
    transition: color var(--duration-ui) ease, border-color var(--duration-ui) ease;
  }
  :global(.tab[aria-selected="true"]) { border-block-end-color: var(--ufg); color: var(--ufg); }
  @media (hover: hover) and (pointer: fine) {
    :global(.tab:hover) { color: var(--ufg); }
  }
  :global(.gf-tab-content) { padding-block: 16px; font-family: var(--font-body); }
</style>