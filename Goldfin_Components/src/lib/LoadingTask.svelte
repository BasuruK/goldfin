<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Snippet } from 'svelte';
  import { createLoadingTask, type LoadingState } from './loading.js';

  type LoadingTaskSnippetArgs = {
    busy: boolean;
    state: LoadingState;
    start: () => void;
    cancel: () => void;
  };

  let {
    children,
    delay = 1600,
    onComplete = () => {}
  }: {
    children?: Snippet<[LoadingTaskSnippetArgs]>;
    delay?: number;
    onComplete?: () => void;
  } = $props();
  let state = $state<LoadingState>('idle');
  const task = createLoadingTask(next => state = next);
  const busy = $derived(state === 'running');
  function start() { task.start(delay, onComplete); }
  function cancel() { task.cancel(); }
  onDestroy(() => task.cancel('idle'));
</script>{@render children?.({ busy, state, start, cancel })}
