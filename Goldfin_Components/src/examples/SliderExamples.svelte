<script>
  import Slider from '../lib/Slider.svelte';
  import Section from '../lib/Section.svelte';
  let temperature = $state(0);
  let tokens = $state(16384);
  let smallTemperature = $state(1);
</script>
<Section title="Sliders" reference="Standard · small · disabled" id="sliders">
  <div class="slider-gallery od-stack">
    <Slider label="Temperature" bind:value={temperature} min={0} max={2} step={0.1} format="decimal"/>
    <Slider label="Max tokens" bind:value={tokens} min={256} max={32768} step={256} unit="tokens"/>
    <Slider label="Temperature · Small" bind:value={smallTemperature} min={0} max={2} step={0.1} format="decimal" size="sm"/>
    <Slider label="Max tokens · Disabled" value={16384} min={256} max={32768} step={256} unit="tokens" disabled/>
  </div>
  <p class="field-desc" style="margin-top:16px">Sample ranges: Temperature 0–2; Max tokens 256–32,768. Model limits vary. Arrow keys change steps; Home / End select bounds.</p>
</Section>