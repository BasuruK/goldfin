<script lang="ts">
  import type { Snippet } from 'svelte';

  /* `reference` is the mono note beside the title; `id` stays the HTML id. */
  let {
    title,
    reference = undefined,
    legend = undefined,
    id = undefined,
    class: className = '',
    'data-od-id': odId,
    children
  }: {
    title: string;
    reference?: string;
    legend?: string;
    id?: string;
    class?: string;
    'data-od-id'?: string;
    children?: Snippet;
  } = $props();
</script>
<section class={['section', className]} data-od-id={odId} {id}>
  <div class="section-head">
    <h2 class="section-title">{title}</h2>
    <span class="section-id">{reference}</span>
  </div>
  {#if legend}<p class="field-legend">{legend}</p>{/if}
  {@render children?.()}
</section>
