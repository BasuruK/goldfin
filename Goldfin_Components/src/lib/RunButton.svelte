<script>
  import { onDestroy } from 'svelte';
  let { onRun, disabled = false, label = 'Run', sample = false } = $props();
  let busy = $state(false);
  let sinking = $state(false);
  let status = $state('');
  let alive = true;
  let timer;
  let sinkTimer;
  let currentRun = 0;
  onDestroy(() => { alive = false; clearTimeout(timer); clearTimeout(sinkTimer); });
  function settle(message) { if (!alive) return; busy = false; status = message; sinking = true; clearTimeout(sinkTimer); sinkTimer = setTimeout(() => { if (alive) sinking = false; }, 1100); }
  async function run() {
    if (disabled) return;
    if (busy) { currentRun++; clearTimeout(timer); settle('Run stopped.'); return; }
    const thisRun = ++currentRun;
    busy = true; sinking = false; status = 'Running main LLM test case…';
    try { if (onRun) await onRun(); else if (sample) await new Promise(resolve => timer = setTimeout(resolve, 1900)); else throw new Error('Connect the main LLM test-case runner.'); if (thisRun === currentRun) settle(sample ? 'Sample test case complete.' : 'Test case complete.'); }
    catch (error) { if (alive && thisRun === currentRun) { busy = false; status = error instanceof Error ? error.message : 'Test case failed. Try again.'; } }
  }
</script><div class="od-stack"><button type="button" class="run-btn" {disabled} aria-label={busy ? 'Stop the main LLM test case' : 'Run main LLM test case'} aria-busy={busy} data-wave={busy || sinking} onclick={run}><span class="label"><span>{busy ? 'Stop' : label}</span></span><span class={['sea', sinking && 'sinking']} aria-hidden="true"><span class="sea-body"><span class="sea-crest"><svg viewBox="0 0 200 10" preserveAspectRatio="none"><path d="M0 5 Q25 0 50 5 T100 5 T150 5 T200 5 V10 H0Z"/></svg></span><span class="sea-water"></span>{#each ['back','mid','front'] as layer}<span class={['wave', layer]}><svg viewBox="0 0 200 10" preserveAspectRatio="none"><path d="M0 5 Q25 2 50 5 T100 5 T150 5 T200 5 V10 H0Z" opacity=".5"/></svg></span>{/each}</span></span></button><span class="field-desc" role="status">{status || (sample ? 'Local sample · no model call' : '')}</span></div>
