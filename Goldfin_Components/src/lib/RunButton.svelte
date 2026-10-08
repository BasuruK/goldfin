<script>
  import { onDestroy } from 'svelte';
  import Sea from './Sea.svelte';
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
</script><div class="od-stack"><button type="button" class="run-btn" {disabled} aria-label={busy ? 'Stop the main LLM test case' : 'Run main LLM test case'} aria-busy={busy} data-wave={busy || sinking} onclick={run}><span class="label"><span>{busy ? 'Stop' : label}</span></span><Sea {sinking} /></button><span class="field-desc" role="status">{status || (sample ? 'Local sample · no model call' : '')}</span></div>
