<script lang="ts">
  import { DropdownMenu as Primitive } from 'bits-ui';
  import type { Snippet } from 'svelte';

  let {
    disabled = false,
    onSelect,
    children
  }: {
    disabled?: boolean;
    onSelect?: (event: Event) => void;
    children?: Snippet;
  } = $props();
</script>
<Primitive.Item class="dd-opt" {disabled} {onSelect}>{@render children?.()}</Primitive.Item>