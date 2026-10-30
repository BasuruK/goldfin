<script lang="ts">
  import { tokenizeJsonLine, isNullLine } from './json.js';
  let {
    line,
    index,
    opens = false,
    folded = false,
    count = null,
    ontoggle
  }: {
    line: string;
    index: number;
    opens?: boolean;
    folded?: boolean;
    count?: number | null;
    ontoggle: (index: number) => void;
  } = $props();
  const nullLine = $derived(isNullLine(line));
</script>

<!-- The row contents are shared by both branches; only the wrapping element differs. -->
{#snippet row()}
  <span class="ln">{index + 1}</span>
  <span class="mark" aria-label={nullLine ? 'Missing value' : undefined}>{nullLine ? '●' : ''}</span>
  <span class="chev" aria-hidden="true">{opens ? (folded ? '▸' : '▾') : ''}</span>
  <!-- No whitespace between the blocks: .segs is pre-wrap, so any gap here is
       rendered as a trailing space on every line and lands in copied JSON. -->
  <code class="segs">{#each tokenizeJsonLine(line) as token, tokenIndex (tokenIndex)}<span
    class={token.cls}>{token.text}</span>{/each}{#if count !== null}<span class="k-cnt"> {count} items</span>{/if}</code>
{/snippet}

<!-- A line that opens a node is a disclosure, so it is a real <button> and gets
     focus order, Enter and Space for free. A leaf line toggles nothing, so it
     stays a plain <div> and sits outside the tab order entirely. -->
{#if opens}
  <button
    type="button"
    class="jsonline clickable"
    class:is-null={nullLine}
    aria-expanded={!folded}
    onclick={() => ontoggle(index)}
  >{@render row()}</button>
{:else}
  <div class="jsonline" class:is-null={nullLine}>{@render row()}</div>
{/if}

<style>
  /* :global(.gf-json) is this line's ancestor inside JSONViewer.svelte, which
     owns that class; the compiler in this file cannot see it. */
  :global(.gf-json) .jsonline { min-block-size: 24px; }
  /* Every row, not only the ones that fold: uneven rows would break the code
     block's rhythm and the line numbers' alignment. */
  @media (pointer: coarse) {
    :global(.gf-json) .jsonline { min-block-size: 44px; align-items: center; }
  }
  .jsonline {
    display: grid;
    grid-template-columns: 40px 14px 14px minmax(0, 1fr);
    background-color: var(--row-bg, transparent);
  }
  .jsonline.is-null { --row-bg: var(--badbg); }
  .jsonline.clickable { cursor: pointer; }
  /* The folding branch is a <button>, so the UA's button styling is taken back
     out and the row is left looking exactly as the plain <div> branch does. */
  button.jsonline {
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: start;
    inline-size: 100%;
  }
  button.jsonline:focus-visible {
    outline: 2px solid var(--key);
    outline-offset: 2px;
  }
  button.jsonline:active {
    background-image: linear-gradient(var(--hover), var(--hover));
  }

  @media (hover: hover) and (pointer: fine) {
    /* hover is a translucent overlay, so it layers over --row-bg instead of
       replacing the row tint */
    .jsonline.clickable:hover { background-image: linear-gradient(var(--hover), var(--hover)); }
  }

  .jsonline .ln { text-align: end; color: var(--ufg3); opacity: .75; padding-inline-end: 6px; }
  .jsonline .mark { color: var(--bad); text-align: center; font-size: 9px; }
  .jsonline .chev { color: var(--ufg3); text-align: center; font-size: 10px; }
  .jsonline .segs { padding-inline-end: 16px; white-space: pre-wrap; overflow-wrap: anywhere; }

  /* The token classes come from json.js at runtime, so the compiler cannot see them. */
  .jsonline :global(.k-key) { color: var(--key); }
  .jsonline :global(.k-str) { color: var(--str); }
  .jsonline :global(.k-num) { color: var(--num); }
  .jsonline :global(.k-ok) { color: var(--ok); }
  .jsonline :global(.k-bad) { color: var(--bad); }
  .jsonline :global(.k-p),
  .jsonline :global(.k-cnt) { color: var(--p); }
</style>
