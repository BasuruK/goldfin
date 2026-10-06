<script>
  import { ToggleGroup as Primitive } from 'bits-ui';
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
  {#each items as item (item.value)}<Primitive.Item class={['seg-btn', selected === item.value && 'active']} value={item.value} disabled={item.disabled}>{item.label}</Primitive.Item>{/each}
</Primitive.Root>

<style>
  /* .seg and .seg-btn are handed to bits-ui parts, so the compiler never sees them and
     :global() is required. .seg-thumb is an element this component renders, so it stays scoped. */
  :global(.seg) { position: relative; display: flex; width: max-content; max-width: 100%; gap: 2px; padding: 2px; border-radius: 7px; background-color: var(--upill); transition: opacity 180ms, box-shadow 180ms; }
  :global(.seg[data-disabled]) { cursor: not-allowed; box-shadow: inset 0 2px 6px rgba(0,0,0,.2); background-image: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ufg3) 42.5%, transparent) 0 1px, transparent 1px 5px); }
  .seg-thumb { position: absolute; top: 2px; bottom: 2px; left: 0; z-index: 0; width: var(--thumb-w, 0px); transform: translateX(var(--thumb-x, 0px)); box-sizing: border-box; border: 1px solid var(--uline); border-radius: 5px; background: var(--uprim); pointer-events: none; }
  :global(.seg[data-ready="true"]) .seg-thumb { transition: transform 220ms cubic-bezier(.22,1,.32,1), width 220ms cubic-bezier(.22,1,.32,1), background-color 200ms ease, border-color 200ms ease; }
  :global(.seg-btn) { position: relative; z-index: 1; height: 24px; padding: 0 10px; box-sizing: border-box; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--ufg3); font: 700 12.5px 'Urbanist', sans-serif; cursor: pointer; transition: color 200ms ease; }
  :global(.seg-btn.active) { color: var(--uprimfg); }
  :global(.seg[data-disabled]) :global(.seg-btn) { cursor: not-allowed; color: color-mix(in srgb, var(--ufg3) 60%, transparent); }
  :global(.seg[data-disabled]) .seg-thumb { background: color-mix(in srgb, var(--ufg3) 20%, transparent); border-color: transparent; }
</style>
