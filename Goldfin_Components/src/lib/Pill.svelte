<script>
  let { variant = '', class: className = '', children, ...rest } = $props();
</script>
<span {...rest} class={['pill', variant, className]}>{@render children?.()}</span>

<style>
  .pill { display: inline-flex; align-items: center; gap: 5px; block-size: 28px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--upill); color: var(--ufg); font: 600 13.5px var(--font-ui); white-space: nowrap; }
  .pill.inverted { background: var(--uprim); color: var(--uprimfg); }
  .pill.ok-pill { background: var(--okbg); color: var(--ok); }
  .pill.running-pill { background: var(--runchip); color: var(--runchipfg); }
  .pill.missing { background: var(--badbg); color: var(--bad); font-weight: 700; }
  /* These inner spans are written by the caller, so the compiler cannot see them. */
  .pill :global(.mono) { font: 500 12.5px var(--font-mono); }
  .pill :global(.k) { color: var(--key); }
  .pill :global(.n) { color: var(--num); }
  .pill.missing :global(.sub) { font-size: 12.5px; font-weight: 500; }
</style>