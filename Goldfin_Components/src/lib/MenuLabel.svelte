<script>
  import { DropdownMenu as Primitive } from 'bits-ui';
  let { children } = $props();
</script>
<!-- GroupHeading needs a Group context; the part carries it so a screen writes one tag. -->
<Primitive.Group><Primitive.GroupHeading class="gf-menu-label">{@render children?.()}</Primitive.GroupHeading></Primitive.Group>

<style>
  /* Handed to a bits-ui part, so :global() is required. */
  :global(.gf-menu-label) { padding: 6px 10px 4px; color: var(--ufg3); font: 600 11.5px 'Urbanist', sans-serif; }
</style>