<script>
  import { onDestroy } from 'svelte';
  import Icon from './Icon.svelte';
  let { onRun, disabled = false, label = 'Run', sample = false } = $props();
  let busy = $state(false);
  let status = $state('');
  let alive = true;
  let timer;
  onDestroy(() => { alive = false; clearTimeout(timer); });
  async function run() {
    if (busy || disabled) return;
    busy = true; status = 'Running main LLM test case…';
    try { if (onRun) await onRun(); else if (sample) await new Promise(resolve => timer = setTimeout(resolve, 1900)); else throw new Error('Connect the main LLM test-case runner.'); if (alive) status = sample ? 'Sample test case complete.' : 'Test case complete.'; }
    catch (error) { if (alive) status = error instanceof Error ? error.message : 'Test case failed. Try again.'; }
    finally { if (alive) busy = false; }
  }
</script><div class="od-stack"><button type="button" class="run-btn" {disabled} aria-label="Run main LLM test case" aria-busy={busy} onclick={run}><span class="label"><span>{busy ? 'Running…' : label}</span></span><span class={['sea', busy && 'visible']} aria-hidden="true"><span class="sea-water"></span><span class="sea-crest"><svg viewBox="0 0 200 10" preserveAspectRatio="none"><path d="M0 5 Q25 0 50 5 T100 5 T150 5 T200 5 V10 H0Z" opacity=".6"/></svg></span>{#each ['back','mid','front'] as layer}<span class={['wave', layer]}><svg viewBox="0 0 200 10" preserveAspectRatio="none"><path d="M0 5 Q25 2 50 5 T100 5 T150 5 T200 5 V10 H0Z" opacity=".5"/></svg></span>{/each}</span></button><span class="field-desc" role="status">{status || (sample ? 'Local sample · no model call' : '')}</span></div>