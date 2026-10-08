<script>
  import Icon from './Icon.svelte';
  // Marker plus the connector below it; icon === 'spinner' draws the ring loader.
  let { icon = '' } = $props();
</script>
<div class="timeline-rail" aria-hidden="true">
  <span class="timeline-marker">{#if icon === 'spinner'}<span class="spinner" aria-hidden="true" data-size="sm"></span>{:else if icon}<Icon name={icon} size={12}/>{/if}</span>
  <span class="timeline-connector"></span>
</div>