<script>
  import { ToggleGroup as Primitive } from 'bits-ui';
  let { value, active = false, disabled = false, children } = $props();
</script>
<Primitive.Item class={['seg-btn', active && 'active']} {value} {disabled}>
  {@render children?.()}
</Primitive.Item>

<style>
  /* .seg-btn is handed to a bits-ui part, so the compiler never sees it and :global() is
     required. The active .seg-btn is also the anchor the sliding thumb sizes to. */
  :global(.seg-btn) {
    position: relative;
    z-index: 1;
    height: 24px;
    padding: 0 10px;
    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--ufg3);
    font: 700 12.5px var(--font-ui);
    white-space: nowrap;
    cursor: pointer;
    transition: color var(--duration-menu) ease;
  }
  /* The active segment is the anchor the thumb in SegmentedControl.svelte sizes to. */
  :global(.seg-btn.active) { color: var(--uprimfg); anchor-name: --seg-active; }

  @media (hover: hover) and (pointer: fine) {
    :global(.seg-btn:not([disabled]):not(.active):hover) { color: var(--ufg); }
  }
</style>
