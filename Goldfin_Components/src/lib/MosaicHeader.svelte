<script lang="ts">
  import Mosaic from './Mosaic.svelte';
  import Icon from './Icon.svelte';
  import type { Snippet } from 'svelte';

  let { children, icon = '' }: { children?: Snippet; icon?: string } = $props();
  let hasMosaic = $state(false);
  function setMosaic(next: boolean) {
    hasMosaic = next;
  }
</script>
<div class="modal-head" class:has-mosaic={hasMosaic}>
  {#if icon}<span class="modal-icon"><Icon name={icon} size={18} /></span>{/if}
  {@render children?.()}
  <Mosaic onready={setMosaic} />
</div>