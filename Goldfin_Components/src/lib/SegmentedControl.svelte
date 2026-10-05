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
