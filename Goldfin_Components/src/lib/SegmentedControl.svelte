<script>
  import { ToggleGroup as Primitive } from 'bits-ui';
  import SegmentedItem from './SegmentedItem.svelte';
  import { activeIndex, resolveValue, thumbVars } from './segment.js';
  let { value = $bindable(''), items, label = 'Options', disabled = false } = $props();
  let root = $state(null);
  let placed = $state(false);
  const selected = $derived(resolveValue(value, items));
  const index = $derived(activeIndex(selected, items));
  $effect(() => {
    if (!root || placed) return;
    const frame = requestAnimationFrame(() => { placed = true; });
    return () => cancelAnimationFrame(frame);
  });
  $effect(() => {
    const next = index;
    if (!root || !items.length) return;
    const place = () => {
      const bounds = root.getBoundingClientRect();
      const boxes = [...root.querySelectorAll('.seg-btn')].map(button => {
        const rect = button.getBoundingClientRect();
        return { x: rect.left - bounds.left, width: rect.width };
      });
      const vars = thumbVars(boxes, next);
      if (!vars) return;
      root.style.setProperty('--thumb-x', vars.x);
      root.style.setProperty('--thumb-w', vars.width);
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(root);
    for (const button of root.querySelectorAll('.seg-btn')) observer.observe(button);
    return () => observer.disconnect();
  });
</script><Primitive.Root type="single" bind:value={() => selected, next => { if (next) value = next; }} bind:ref={root} {disabled} class="seg" data-ready={placed} aria-label={label}>
  <span class="seg-thumb" aria-hidden="true"></span>
  {#each items as item (item.value)}<SegmentedItem value={item.value} active={selected === item.value} disabled={item.disabled}>{item.label}</SegmentedItem>{/each}
</Primitive.Root>

<style>
  /* .seg is handed to a bits-ui part, so the compiler never sees it and :global() is required.
     .seg-thumb and the root-state rules stay here: they read state the root owns. The .seg-btn
     rules live in SegmentedItem.svelte, the component that renders the class. */
  :global(.seg) { position: relative; display: flex; width: max-content; max-width: 100%; gap: 2px; padding: 2px; border-radius: 7px; background-color: var(--upill); transition: opacity var(--duration-ui) ease, box-shadow var(--duration-ui) ease; }
  :global(.seg[data-disabled]) { cursor: not-allowed; box-shadow: inset 0 2px 6px oklch(0% 0 none / 0.2); background-image: repeating-linear-gradient(135deg, color-mix(in oklch, var(--ufg3) 42.5%, transparent) 0 1px, transparent 1px 5px); }
  .seg-thumb { position: absolute; inset-block: 2px; inset-inline-start: 0; z-index: 0; inline-size: var(--thumb-w, 0px); box-sizing: border-box; border: 1px solid var(--uline); border-radius: 5px; background: var(--uprim); pointer-events: none; }

  /* The thumb is positioned from the measured --thumb-x whether or not motion is
     allowed; only the slide between placements is motion. `data-ready` gates it:
     before the first measurement the thumb has no size, and sliding from nothing
     reads as a jump. */
  :global(.seg[data-ready="true"]) .seg-thumb { transform: translateX(var(--thumb-x, 0px)); }
  @media (prefers-reduced-motion: no-preference) {
    :global(.seg[data-ready="true"]) .seg-thumb { transition: transform 220ms var(--ease-out), inline-size 220ms var(--ease-out), background-color var(--duration-menu) ease, border-color var(--duration-menu) ease; }
  }

  :global(.seg[data-disabled]) :global(.seg-btn) { cursor: not-allowed; color: color-mix(in oklch, var(--ufg3) 60%, transparent); }
  :global(.seg[data-disabled]) .seg-thumb { background: color-mix(in oklch, var(--ufg3) 20%, transparent); border-color: transparent; }
</style>
