<script lang="ts">
  import { onMount } from 'svelte';
  import { createMosaicTiles, mosaicPeak, type MosaicTile } from './mosaic.js';
  /* onready reports whether the band has tiles, so a header can drop its fallback pattern. */
  let { onready = () => {} } = $props();
  let band: HTMLDivElement | undefined = $state(undefined);
  let columns = $state(1);
  let tiles = $state<MosaicTile[]>([]);
  let paused = $state(false);
  const pendingPeaks = new Set<MosaicTile>();
  let peakFrame = 0;
  function queuePeak(tile: MosaicTile) {
    pendingPeaks.add(tile);
    peakFrame ||= requestAnimationFrame(flushPeaks);
  }
  function flushPeaks() {
    peakFrame = 0;
    for (const tile of pendingPeaks) tile.peak = mosaicPeak();
    pendingPeaks.clear();
  }
  onMount(() => {
    const target = band;
    if (!target) return;
    /* The band is inset 0 on its positioned parent, so its box is the box to tile. */
    const resize = () => {
      const nextColumns = Math.max(1, Math.ceil(target.clientWidth / 10));
      const rows = Math.max(1, Math.ceil(target.clientHeight / 10));
      if (nextColumns !== columns || nextColumns * rows !== tiles.length) {
        columns = nextColumns;
        tiles = createMosaicTiles(columns, rows);
      }
    };
    function visibility() { paused = document.hidden; }
    resize(); visibility();
    const observer = new ResizeObserver(resize);
    observer.observe(target);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancelAnimationFrame(peakFrame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
    };
  });
  $effect(() => onready(tiles.length > 0));
</script>
<div class="modal-mosaic" aria-hidden="true" style:--mosaic-columns={columns} bind:this={band}>
  {#each tiles as tile}
    <i class="modal-mosaic-cell" style:--tile-base={tile.base} style:--tile-peak={tile.peak}
      style:--tile-delay={tile.delay + 'ms'} style:animation-play-state={paused ? 'paused' : 'running'}
      onanimationiteration={() => queuePeak(tile)}></i>
  {/each}
</div>