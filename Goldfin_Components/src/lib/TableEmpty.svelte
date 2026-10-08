<script>
  let { text = 'No rows to display.' } = $props();
</script>
<p class="field-desc table-empty">{text}</p>

<style>
  /* The 16px padding lives in components.css with the other table rules, so the
     empty state and the frame it sits inside cannot drift apart. */
  .table-empty { margin: 0; }
</style>