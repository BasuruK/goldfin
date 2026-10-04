<script>
  import { DropdownMenu as Primitive } from 'bits-ui';
  let { label, items, onAction } = $props();
</script>
<Primitive.Root>
  <Primitive.Trigger class="btn">{label}</Primitive.Trigger>
  <Primitive.Portal>
    <Primitive.Content class="dd-menu gf-menu gf-actions" sideOffset={6}>
      {#each items as item (item.value)}
        <Primitive.Item class="dd-opt" disabled={item.disabled} onSelect={() => onAction?.(item.value)}>{item.label}</Primitive.Item>
      {/each}
    </Primitive.Content>
  </Primitive.Portal>
</Primitive.Root>