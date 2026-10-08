<script>
  import { onDestroy } from 'svelte';
  import { createCopyTask } from './copy.js';
  import Icon from './Icon.svelte';
  let { text = '', label = 'Copy JSON' } = $props();
  let copied = $state(false);
  let error = $state('');
  const task = createCopyTask(next => { copied = next.copied; error = next.error; });
  onDestroy(() => task.destroy());
</script><div class="od-stack"><button type="button" class="copy-btn" class:copied onclick={() => task.copy(text)}><Icon name="copy" size={13}/><span class="copy-labels"><span class="in">{label}</span><span class="out" aria-hidden="true">Copied!</span></span></button><span class="field-msg" role="status">{error || (copied ? 'Copied to clipboard.' : '')}</span></div>