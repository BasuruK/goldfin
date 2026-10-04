<script>
  import { onDestroy } from 'svelte';
  import { createLoadingTask } from './loading.js';
  let { children, delay = 1600, onComplete = () => {} } = $props();
  let state = $state('idle');
  const task = createLoadingTask(next => state = next);
  const busy = $derived(state === 'running');
  function start() { task.start(delay, onComplete); }
  function cancel() { task.cancel(); }
  onDestroy(() => task.cancel('idle'));
</script>{@render children?.({ busy, state, start, cancel })}