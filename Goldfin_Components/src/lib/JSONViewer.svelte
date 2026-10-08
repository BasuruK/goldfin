<script>
  import { safeStringify } from './format.js';
  import { countChildItems, nodeRange, toggleFold, hiddenLines } from './json.js';
  import JSONLine from './JSONLine.svelte';
  let { value = {}, label = 'JSON output' } = $props();
  const text = $derived(safeStringify(value));
  /* New JSON drops the old folds; the same text keeps them. */
  let folded = $derived.by(() => {
    text;
    return new Set();
  });
  const lines = $derived(text.split('\n'));
  const counts = $derived(countChildItems(lines));
  const ranges = $derived(lines.map((_, index) => nodeRange(lines, index)));
  const hidden = $derived(hiddenLines(ranges, folded));
  const toggle = index => { folded = toggleFold(folded, index); };
</script><div class="jsonbox gf-json" role="region" aria-label={label}><div class="gf-json-body">{#each lines as line, index}{#if !hidden[index]}<JSONLine {line} {index} opens={ranges[index].opens} folded={folded.has(index)} count={counts[index]} ontoggle={toggle}/>{/if}{/each}</div></div>

<style>
  /* The per-line rules live in JSONLine.svelte; this component owns the region and its scroller. */
  /* Both boxes scroll, so they keep `auto` rather than `clip`. */
  .jsonbox { position: relative; min-block-size: 120px; overflow: auto; padding: 10px 0; border: 1px solid var(--uoutline); border-radius: 10px; background: var(--uout); font: 400 12.5px/1.7 var(--font-mono); }
  .gf-json-body { max-block-size: 320px; overflow: auto; overscroll-behavior: contain; }
</style>