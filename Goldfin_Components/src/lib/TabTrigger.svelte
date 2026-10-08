<script>
  import { Tabs as Primitive } from 'bits-ui';
  let { value, active = false, disabled = false, children } = $props();
</script>
<Primitive.Trigger class={['tab', active && 'active']} {value} {disabled}>{@render children?.()}</Primitive.Trigger>

<style>
  /* .tab is handed to a bits-ui part, so :global() is required. */
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
</style>