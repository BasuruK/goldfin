<script>
  import { ToggleGroup as Primitive } from 'bits-ui';
  let { value, active = false, disabled = false, children } = $props();
</script>
<Primitive.Item class={['seg-btn', active && 'active']} {value} {disabled}>{@render children?.()}</Primitive.Item>

<style>
  /* .seg-btn is handed to a bits-ui part, so the compiler never sees it and :global() is
     required. .seg-btn is also the handle SegmentedControl measures for the sliding thumb. */
  :global(.seg-btn) { position: relative; z-index: 1; height: 24px; padding: 0 10px; box-sizing: border-box; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--ufg3); font: 700 12.5px 'Urbanist', sans-serif; cursor: pointer; transition: color 200ms ease; }
  :global(.seg-btn.active) { color: var(--uprimfg); }
</style>