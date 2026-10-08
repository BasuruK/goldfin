<script>
  import { Tabs as Primitive } from 'bits-ui';
  let { label = 'Views', children } = $props();
</script>
<Primitive.List class="tabs" aria-label={label}>{@render children?.()}</Primitive.List>

<style>
  /* Every class here is handed to a bits-ui part, so the compiler never sees it.
     :global() is required; a plain selector would be pruned as unused. */
  :global(.tabs) { display: flex; gap: 0; border-bottom: 1px solid var(--uline); }
</style>