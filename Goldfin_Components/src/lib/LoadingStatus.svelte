<script>
  /* The visible counterpart to Spinner: a real spinner beside real text, tinted by tone.
     Spinner.svelte keeps the aria-hidden variant (visible ring, sr-only label) and owns
     that row shell, so this renders the same shell with the text left visible. */
  let { text, tone, spinnerSize = 'md', status = true, children } = $props();
</script>
<div class="od-row" role={status ? 'status' : undefined} data-loading-tone={tone}>
  <span class="spinner" aria-hidden="true" data-size={spinnerSize}></span>
  <span>{#if children}{@render children()}{:else}{text}{/if}</span>
</div>