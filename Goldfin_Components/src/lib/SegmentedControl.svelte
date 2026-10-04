<script>
  import { ToggleGroup as Primitive } from 'bits-ui';
  let { value = $bindable(''), items, label = 'Options', disabled = false } = $props();
</script>
<Primitive.Root type="single" bind:value={() => value || items[0]?.value, next => { if (next) value = next; }} {disabled} class="seg" aria-label={label}>
  {#each items as item (item.value)}<Primitive.Item class={['seg-btn', (value || items[0]?.value) === item.value && 'active']} value={item.value} disabled={item.disabled}>{item.label}</Primitive.Item>{/each}
</Primitive.Root>