<script>
  let { rows = 3 } = $props();
</script>
<div class="loading-skeleton" aria-hidden="true">
  {#each Array(rows) as _, row (row)}<span></span>{/each}
</div>