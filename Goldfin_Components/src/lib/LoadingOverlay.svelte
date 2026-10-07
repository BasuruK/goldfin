<script>
  import Skeleton from './Skeleton.svelte';
  /* `loading-demo` carries the `[hidden]` rule that takes the overlay out of the flow, so a
     stage dropped into a product screen hides its overlay without extra CSS at the call site. */
  let { busy = false, state = 'idle', overlay = '', empty = false, example, children } = $props();
</script>
<div class={['loading-stage', empty && 'loading-empty', 'loading-demo']} aria-busy={busy} data-state={state} data-example={example}>
  <div class="loading-content od-stack" inert={busy} aria-hidden={busy}>{@render children?.()}</div>
  <div class="loading-overlay" hidden={!busy}><span class="spinner" aria-hidden="true" data-size="lg"></span><strong>{overlay}</strong><p class="loading-hint">Sample operation in progress</p><Skeleton/></div>
</div>