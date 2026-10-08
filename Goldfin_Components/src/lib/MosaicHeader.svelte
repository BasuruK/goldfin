<script>
  import Mosaic from './Mosaic.svelte';
  import Icon from './Icon.svelte';
  let { children, icon = '' } = $props();
  let hasMosaic = $state(false);
  function setMosaic(next) { hasMosaic = next; }
</script>
<div class="modal-head" class:has-mosaic={hasMosaic}>
  {#if icon}<span class="modal-icon"><Icon name={icon} size={18} /></span>{/if}
  {@render children?.()}
  <Mosaic onready={setMosaic} />
</div>