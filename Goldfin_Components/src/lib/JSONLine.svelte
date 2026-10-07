<script>
  import { tokenizeJsonLine, isNullLine } from './json.js';
  let { line, index, opens = false, folded = false, count = null, ontoggle } = $props();
  const nullLine = $derived(isNullLine(line));
  function onKeydown(event) {
    if (!opens || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    ontoggle(index);
  }
</script><div class="jsonline" class:is-null={nullLine} class:clickable={opens} role={opens ? 'button' : undefined} aria-expanded={opens ? !folded : undefined} tabindex={opens ? 0 : undefined} onclick={() => opens && ontoggle(index)} onkeydown={onKeydown}><span class="ln">{index + 1}</span><span class="mark" aria-label={nullLine ? 'Missing value' : undefined}>{nullLine ? '●' : ''}</span><span class="chev" aria-hidden="true">{opens ? (folded ? '▸' : '▾') : ''}</span><code class="segs">{#each tokenizeJsonLine(line) as token}<span class={token.cls}>{token.text}</span>{/each}{#if count !== null}<span class="k-cnt"> {count} items</span>{/if}</code></div>

<style>
  :global(.gf-json) .jsonline { min-height: 24px; }
  :global(.gf-json) .segs { white-space: pre-wrap; overflow-wrap: anywhere; }
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