<script lang="ts">
  let {
    size = 'md',
    tone,
    label = 'Loading',
    dots = false
  }: { size?: string; tone?: string; label?: string; dots?: boolean } = $props();
</script>

<span class="od-row" role="status" data-loading-tone={tone}>
  {#if dots}
    <span class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
  {:else}
    <span class="spinner" aria-hidden="true" data-size={size}></span>
  {/if}
  <span class="sr-only">{label}</span>
</span>
