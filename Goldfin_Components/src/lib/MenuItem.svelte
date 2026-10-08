<script>
  import { DropdownMenu as Primitive } from 'bits-ui';
  let { disabled = false, onSelect, children } = $props();
</script>
<Primitive.Item class="dd-opt" {disabled} {onSelect}>{@render children?.()}</Primitive.Item>