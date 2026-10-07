<script>
  let { label, value, valueStyle = '', children } = $props();
</script>
<div class="row"><span>{#if children}{@render children()}{:else}{label}{/if}</span><span class="read" style={valueStyle || undefined}>{value}</span></div>