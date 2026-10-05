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
