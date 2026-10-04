<script>
  import { useId } from 'bits-ui';
  import { safeStringify } from './format.js';
  let { value = {}, label = 'JSON output' } = $props();
  const id = useId();
  let collapsed = $state(false);
  const text = $derived(safeStringify(value));
  const lines = $derived(text.split('\n'));
  const isMissing = line => /: null,?$/.test(line);
</script><div class="jsonbox gf-json"><button class="gf-json-toggle" type="button" aria-expanded={!collapsed} aria-controls={id} onclick={() => collapsed = !collapsed}>{collapsed ? '▸' : '▾'} {label}<span class="sr-only"> — {collapsed ? 'expand' : 'collapse'}</span></button><div id={id} hidden={collapsed}>{#each lines as line, index}<div class="jsonline"><span class="ln">{index + 1}</span><span class="mark" aria-label={isMissing(line) ? 'Missing value' : undefined}>{isMissing(line) ? '●' : ''}</span><span class="chev"></span><code class="segs">{line}</code></div>{/each}</div></div>