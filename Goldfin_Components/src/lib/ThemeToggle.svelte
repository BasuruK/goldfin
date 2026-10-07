<script>
  let { theme = $bindable('dark') } = $props();
  $effect(() => { document.body.dataset.theme = theme; });
</script>
<button class="theme-btn" type="button" aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'} onclick={() => theme = theme === 'dark' ? 'light' : 'dark'}>Toggle theme</button>