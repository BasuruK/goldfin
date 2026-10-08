<script>
  let { text = 'No rows to display.' } = $props();
</script>
<p class="field-desc table-empty" style="padding:16px">{text}</p>

<style>
  .table-empty { margin: 0; }
</style>