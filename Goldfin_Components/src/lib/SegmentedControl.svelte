<script lang="ts">
  import { ToggleGroup as Primitive } from 'bits-ui';
  import SegmentedItem from './SegmentedItem.svelte';
  import { resolveValue } from './segment.js';
  let { value = $bindable(''), items, label = 'Options', disabled = false } = $props();
  const selected = $derived(resolveValue(value, items));
</script>

<Primitive.Root
  type="single"
  bind:value={() => selected, next => { if (next) value = next; }}
  {disabled}
  class="seg"
  aria-label={label}
>
  <span class="seg-thumb" aria-hidden="true"></span>
  {#each items as item (item.value)}
    <SegmentedItem value={item.value} active={selected === item.value} disabled={item.disabled}>
      {item.label}
    </SegmentedItem>
  {/each}
</Primitive.Root>

<style>
  /* .seg is handed to a bits-ui part, so the compiler never sees it and :global() is required.
     .seg-thumb and the root-state rules stay here: they read state the root owns. The .seg-btn
     rules live in SegmentedItem.svelte, the component that renders the class. */
  :global(.seg) {
    position: relative;
    display: flex;
    width: max-content;
    max-width: 100%;
    gap: 2px;
    padding: 2px;
    border-radius: 7px;
    background-color: var(--upill);
    /* Each control scopes its anchor, so two controls on a page do not both
       follow the last active segment. */
    anchor-scope: --seg-active;
    transition: opacity var(--duration-ui) ease, box-shadow var(--duration-ui) ease;
  }
  :global(.seg[data-disabled]) {
    cursor: not-allowed;
    box-shadow: inset 0 2px 6px oklch(0% 0 none / 0.2);
    background-image: repeating-linear-gradient(
      135deg,
      color-mix(in oklch, var(--ufg3) 42.5%, transparent) 0 1px,
      transparent 1px 5px
    );
  }
  .seg-thumb {
    position: absolute;
    position-anchor: --seg-active;
    inset-block: 2px;
    inset-inline-start: anchor(start);
    z-index: 0;
    inline-size: anchor-size(inline);
    box-sizing: border-box;
    border: 1px solid var(--uline);
    border-radius: 5px;
    background: var(--uprim);
    pointer-events: none;
  }

  /* The thumb is placed on the active segment from the first paint, before any
     script runs, so the first placement has nothing to slide from. Only the
     move between segments is motion. */
  @media (prefers-reduced-motion: no-preference) {
    .seg-thumb {
      transition:
        inset-inline-start 220ms var(--ease-out),
        inline-size 220ms var(--ease-out),
        background-color var(--duration-menu) ease,
        border-color var(--duration-menu) ease;
    }
  }

  :global(.seg[data-disabled]) :global(.seg-btn) {
    cursor: not-allowed;
    color: color-mix(in oklch, var(--ufg3) 60%, transparent);
  }
  :global(.seg[data-disabled]) .seg-thumb {
    background: color-mix(in oklch, var(--ufg3) 20%, transparent);
    border-color: transparent;
  }

  /* Without anchor positioning the thumb has no width, and the active label is
     --uprimfg, which is unreadable on the bare track. The segment paints the
     thumb's surface itself instead; it does not slide. */
  @supports not (anchor-name: --a) {
    .seg-thumb { display: none; }
    :global(.seg-btn.active) { background: var(--uprim); border-color: var(--uline); }
    :global(.seg[data-disabled] .seg-btn.active) {
      background: color-mix(in oklch, var(--ufg3) 20%, transparent);
      border-color: transparent;
    }
  }
</style>
