<script>
  import { onDestroy } from 'svelte';
  import Icon from './Icon.svelte';
  let { text = '', label = 'Copy JSON' } = $props();
  let copied = $state(false);
  let error = $state('');
  let timer;
  let alive = true;
  onDestroy(() => { alive = false; clearTimeout(timer); });
  async function copy() { try { if (!globalThis.navigator?.clipboard) throw new Error('Clipboard requires localhost or HTTPS.'); await navigator.clipboard.writeText(text); if (!alive) return; copied = true; error = ''; clearTimeout(timer); timer = setTimeout(() => copied = false, 1800); } catch (cause) { if (!alive) return; clearTimeout(timer); copied = false; error = cause instanceof Error ? cause.message : 'Copy failed. Select and copy the text manually.'; } }
</script><div class="od-stack"><button type="button" class="copy-btn" class:copied onclick={copy}><Icon name="copy" size={13}/><span class="copy-labels"><span class="in">{label}</span><span class="out">Copied!</span></span></button><span class="field-msg" role="status">{error || (copied ? 'Copied to clipboard.' : '')}</span></div>