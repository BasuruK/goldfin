<script>
  /* One body: water, crest and the three wave bands rise together, so the leading edge is a
     wave and never the straight edge of a sheet (DESIGN.md: Run). */
  let { sinking = false } = $props();
</script>
<span class={['sea', sinking && 'sinking']} aria-hidden="true"><span class="sea-body"><span class="sea-crest"><svg viewBox="0 0 200 10" preserveAspectRatio="none"><path d="M0 5 Q25 0 50 5 T100 5 T150 5 T200 5 V10 H0Z"/></svg></span><span class="sea-water"></span>{#each ['back','mid','front'] as layer}<span class={['wave', layer]}><svg viewBox="0 0 200 10" preserveAspectRatio="none"><path d="M0 5 Q25 2 50 5 T100 5 T150 5 T200 5 V10 H0Z" opacity=".5"/></svg></span>{/each}</span></span>