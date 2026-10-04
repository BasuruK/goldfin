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