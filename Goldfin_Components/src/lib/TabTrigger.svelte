<script>
  import { Tabs as Primitive } from 'bits-ui';
  let { value, active = false, disabled = false, children } = $props();
</script>
<Primitive.Trigger class={['tab', active && 'active']} {value} {disabled}>{@render children?.()}</Primitive.Trigger>

<style>
  /* .tab is handed to a bits-ui part, so :global() is required. */
  :global(.tab) { height: 38px; margin: 0 18px -1px 0; padding: 0 4px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--ufg3); font: 700 15px 'Urbanist', sans-serif; cursor: pointer; }
  :global(.tab[aria-selected="true"]) { border-bottom-color: var(--ufg); color: var(--ufg); }
  :global(.tab:hover) { color: var(--ufg); }
</style>