<script>
  import { Tabs as Primitive } from 'bits-ui';
  let { value, children } = $props();
</script>
<Primitive.Content {value} class="gf-tab-content">{@render children?.()}</Primitive.Content>

<style>
  /* .gf-tab-content is handed to a bits-ui part, so :global() is required. */
  :global(.gf-tab-content) { padding-block: 16px; font-family: 'IBM Plex Sans', system-ui, sans-serif; }
</style>