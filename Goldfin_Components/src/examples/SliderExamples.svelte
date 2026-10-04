<script>
  import Slider from '../lib/Slider.svelte';
  let temperature = $state(0);
  let tokens = $state(16384);
  let smallTemperature = $state(1);
</script>
<section class="section" id="sliders">
  <div class="section-head"><h2 class="section-title">Sliders</h2><span class="section-id">Standard · small · disabled</span></div>
  <div class="slider-gallery od-stack">
    <Slider label="Temperature" bind:value={temperature} min={0} max={2} step={0.1} format="decimal"/>
    <Slider label="Max tokens" bind:value={tokens} min={256} max={32768} step={256} unit="tokens"/>
    <Slider label="Temperature · Small" bind:value={smallTemperature} min={0} max={2} step={0.1} format="decimal" size="sm"/>
    <Slider label="Max tokens · Disabled" value={16384} min={256} max={32768} step={256} unit="tokens" disabled/>
  </div>
  <p class="field-desc" style="margin-top:16px">Sample ranges: Temperature 0–2; Max tokens 256–32,768. Model limits vary. Arrow keys change steps; Home / End select bounds.</p>
</section>