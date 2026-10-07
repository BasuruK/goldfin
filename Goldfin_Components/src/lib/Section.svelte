<script>
  /* `reference` is the mono note beside the title; `id` stays the HTML id. */
  let { title, reference, legend, id, class: className = '', 'data-od-id': odId, children } = $props();
</script>
<section class={['section', className]} data-od-id={odId} {id}>
  <div class="section-head"><h2 class="section-title">{title}</h2><span class="section-id">{reference}</span></div>
  {#if legend}<p class="field-legend">{legend}</p>{/if}
  {@render children?.()}
</section>