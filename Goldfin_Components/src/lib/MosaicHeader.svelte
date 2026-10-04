<script>
  import { onMount } from 'svelte';
  import { createMosaicTiles, mosaicPeak } from './mosaic.js';
  import Icon from './Icon.svelte';
  let { children, icon = '' } = $props();
  let header;
  let columns = $state(1);
  let tiles = $state([]);
  let paused = $state(false);
  const pendingPeaks = new Set();
  let peakFrame = 0;
  function queuePeak(tile) {
    pendingPeaks.add(tile);
    peakFrame ||= requestAnimationFrame(flushPeaks);
  }
  function flushPeaks() {
    peakFrame = 0;
    for (const tile of pendingPeaks) tile.peak = mosaicPeak();
    pendingPeaks.clear();
  }
  onMount(() => {
    function resize() {
      const nextColumns = Math.max(1, Math.ceil(header.clientWidth / 10));
      const rows = Math.max(1, Math.ceil(header.clientHeight / 10));
      if (nextColumns !== columns || nextColumns * rows !== tiles.length) {
        columns = nextColumns;
        tiles = createMosaicTiles(columns, rows);
      }
    }
    function visibility() { paused = document.hidden; }
    resize(); visibility();
    const observer = new ResizeObserver(resize);
    observer.observe(header);
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(peakFrame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  });
</script>
<div class="modal-head" class:has-mosaic={tiles.length > 0} bind:this={header}>
  {#if icon}<span class="modal-icon"><Icon name={icon} size={18} /></span>{/if}
  {@render children?.()}
  <div class="modal-mosaic" aria-hidden="true" style:--mosaic-columns={columns}>
    {#each tiles as tile}
      <i class="modal-mosaic-cell" style:--tile-base={tile.base} style:--tile-peak={tile.peak}
        style:--tile-delay={tile.delay + 'ms'} style:animation-play-state={paused ? 'paused' : 'running'}
        onanimationiteration={() => queuePeak(tile)}></i>
    {/each}
  </div>
</div>