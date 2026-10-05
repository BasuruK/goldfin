<script>
  import { safeStringify } from './format.js';
  import { tokenizeJsonLine, isNullLine, countChildItems, nodeRange } from './json.js';
  let { value = {}, label = 'JSON output' } = $props();
  const text = $derived(safeStringify(value));
  let folded = $derived.by(() => {
    text;
    return new Set();
  });
  const lines = $derived(text.split('\n'));
  const counts = $derived(countChildItems(lines));
  const ranges = $derived(lines.map((_, index) => nodeRange(lines, index)));
  const hidden = $derived.by(() => {
    const mask = new Array(lines.length).fill(false);
    for (let index = 0; index < lines.length; index++) {
      if (!folded.has(index) || !ranges[index].opens) continue;
      for (let next = index + 1; next <= ranges[index].end; next++) mask[next] = true;
    }
    return mask;
  });
  function toggle(index) {
    const next = new Set(folded);
    next.has(index) ? next.delete(index) : next.add(index);
    folded = next;
  }
  function onKeydown(event, index) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggle(index);
  }
</script><div class="jsonbox gf-json" role="region" aria-label={label}><div class="gf-json-body">{#each lines as line, index}{#if !hidden[index]}<div class="jsonline" class:is-null={isNullLine(line)} class:clickable={ranges[index].opens} role={ranges[index].opens ? 'button' : undefined} aria-expanded={ranges[index].opens ? !folded.has(index) : undefined} tabindex={ranges[index].opens ? 0 : undefined} onclick={() => ranges[index].opens && toggle(index)} onkeydown={event => onKeydown(event, index)}><span class="ln">{index + 1}</span><span class="mark" aria-label={isNullLine(line) ? 'Missing value' : undefined}>{isNullLine(line) ? '●' : ''}</span><span class="chev" aria-hidden="true">{ranges[index].opens ? (folded.has(index) ? '▸' : '▾') : ''}</span><code class="segs">{#each tokenizeJsonLine(line) as token}<span class={token.cls}>{token.text}</span>{/each}{#if counts[index] !== null}<span class="k-cnt"> {counts[index]} items</span>{/if}</code></div>{/if}{/each}</div></div>

<style>
  .jsonbox { position: relative; min-height: 120px; overflow: auto; padding: 10px 0; border: 1px solid var(--uoutline); border-radius: 10px; background: var(--uout); font: 400 12.5px/1.7 'IBM Plex Mono', monospace; }
  .gf-json .segs { white-space: pre-wrap; overflow-wrap: anywhere; }
  .gf-json-body { max-height: 320px; overflow: auto; }
  .gf-json .jsonline { min-height: 24px; }
  .jsonline { display: grid; grid-template-columns: 40px 14px 14px minmax(0,1fr); background-color: var(--row-bg, transparent); }
  .jsonline.is-null { --row-bg: var(--badbg); }
  .jsonline.clickable { cursor: pointer; }
  /* hover is a translucent overlay, so it layers over --row-bg instead of replacing the row tint */
  .jsonline.clickable:hover { background-image: linear-gradient(var(--hover), var(--hover)); }
  .jsonline .ln { text-align: right; color: var(--ufg3); opacity: .75; padding-right: 6px; }
  .jsonline .mark { color: var(--bad); text-align: center; font-size: 9px; }
  .jsonline .chev { color: var(--ufg3); text-align: center; font-size: 10px; }
  .jsonline .segs { white-space: pre-wrap; word-break: break-word; padding-right: 16px; }
  /* The token classes come from json.js at runtime, so the compiler cannot see them. */
  .jsonline :global(.k-key) { color: var(--key); }
  .jsonline :global(.k-str) { color: var(--str); }
  .jsonline :global(.k-num) { color: var(--num); }
  .jsonline :global(.k-ok) { color: var(--ok); }
  .jsonline :global(.k-bad) { color: var(--bad); }
  .jsonline :global(.k-p), .jsonline :global(.k-cnt) { color: var(--p); }
</style>
