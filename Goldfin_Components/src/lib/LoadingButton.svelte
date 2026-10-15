<script>
  /* One size across every state: the label keeps its box and is only hidden while the
     spinner is centred over the whole button (DESIGN.md, loading buttons). */
  /** @type {Pick<import('svelte/elements').HTMLButtonAttributes, 'type' | 'onclick' | 'disabled' | 'children'> & {
   * busy?: boolean, idle?: string, working?: string, variant?: string, size?: string
   * }} */
  let {
    busy = false,
    idle = '',
    working,
    variant = '',
    size = '',
    disabled = false,
    onclick,
    type = 'button',
    children
  } = $props();
  const busyLabel = $derived(working || idle);
</script>
<button
  class={['btn', variant, size]}
  {type}
  aria-label={busy ? busyLabel : idle}
  {onclick}
  disabled={busy || disabled}
  aria-busy={busy}
>
  <span class="spinner" aria-hidden="true" class:is-on={busy}></span>
  <span class="btn-label" class:is-hidden={busy}>{#if children}{@render children()}{:else}{idle}{/if}</span>
</button>
