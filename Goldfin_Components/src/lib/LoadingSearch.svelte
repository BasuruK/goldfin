<script>
  import { useId } from 'bits-ui';
  import { onDestroy } from 'svelte';
  import { createLoadingTask, sampleSuiteMatches } from './loading.js';
  let query = $state('');
  let state = $state('idle');
  let matches = $state([]);
  const id = useId();
  const task = createLoadingTask(next => state = next);
  function search() { task.cancel('idle'); matches = []; const current = query; if (current.trim()) task.start(700, () => matches = sampleSuiteMatches(current)); }
  onDestroy(() => task.cancel('idle'));
</script><article class="loading-example od-stack"><h3>Spinner in input group</h3><label class="label" for={id}>Search sample suites</label><div class="loading-search" aria-busy={state === 'running'}>{#if state === 'running'}<span class="spinner" aria-hidden="true"></span>{/if}<input id={id} type="search" bind:value={query} oninput={search} placeholder="Search suites…" aria-describedby={id + '-feedback'}/></div><p id={id + '-feedback'} class="loading-feedback" role="status">{state === 'running' ? 'Searching sample suites…' : state === 'complete' ? matches.length ? matches.join(' · ') : 'No sample suites found. Try invoice, supplier or payment.' : 'Try invoice, supplier or payment.'}</p></article>