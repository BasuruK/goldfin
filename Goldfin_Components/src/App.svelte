<script>
  import TokenGallery from './lib/TokenGallery.svelte';
  import TableExamples from './lib/TableExamples.svelte';
  import LoadingGallery from './lib/LoadingGallery.svelte';
  import TimelineGallery from './lib/TimelineGallery.svelte';
  import SliderExamples from './examples/SliderExamples.svelte';
  import DialogExamples from './examples/DialogExamples.svelte';
  import ControlExamples from './examples/ControlExamples.svelte';
  import NativeExamples from './examples/NativeExamples.svelte';
  let theme = $state('dark');
  $effect(() => { document.body.dataset.theme = theme; });
</script>
<svelte:head><title>Goldfin — Component Showcase</title></svelte:head>
<a class="gf-skip" href="#components">Skip to components</a>
<main class="page" id="components">
  <header class="page-header"><div><h1 class="page-title">Goldfin Design System</h1><p class="page-subtitle">Dark/light tokens + components · local samples</p></div><button class="theme-btn" type="button" aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'} onclick={() => theme = theme === 'dark' ? 'light' : 'dark'}>Toggle theme</button></header>
  <nav class="gf-index" aria-label="Component families"><a href="#sliders">Sliders</a><a href="#dialogs">Dialogs</a><a href="#selection">Controls</a><a href="#dropdowns">Dropdowns</a><a href="#tables">Tables</a><a href="#spinners">Loading</a><a href="#timelines">Timelines</a></nav>
  <SliderExamples/><DialogExamples/><ControlExamples/><NativeExamples/><TableExamples/><LoadingGallery/><TimelineGallery/><TokenGallery/>
</main>