<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    aside = '',
    legend = undefined,
    set = false,
    class: className = '',
    children
  }: {
    label?: string;
    aside?: string;
    legend?: string;
    set?: boolean;
    class?: string;
    children?: Snippet;
  } = $props();
</script>

{#if set}
  <fieldset class={['field-set', className]}>
    {#if legend}<legend class="field-legend">{legend}</legend>{/if}
    {@render children?.()}
  </fieldset>
{:else}
  <section class="section-group">
    <div class="section-group-head">
      <h3 class="label">{label}</h3>
      {#if aside}<span class="asideline">{aside}</span>{/if}
    </div>
    {@render children?.()}
  </section>
{/if}

<style>
  .section-group { display: flex; flex-direction: column; gap: 10px; }
  .section-group-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .section-group-head .asideline {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 400 11.5px var(--font-mono);
    color: var(--ufg3);
  }
</style>
