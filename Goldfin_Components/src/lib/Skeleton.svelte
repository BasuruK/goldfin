<script lang="ts">
  let { rows = 3 }: { rows?: number } = $props();
</script>
<div class="loading-skeleton" aria-hidden="true">
  {#each Array(rows) as _, row (row)}<span></span>{/each}
</div>