<script>
  import MosaicHeader from './MosaicHeader.svelte';
  import Icon from './Icon.svelte';
  // `parts` is the bits-ui Dialog or AlertDialog namespace; Title/Description/Close differ between them.
  let { parts, title, description, icon = '', close = false } = $props();
  const Title = $derived(parts.Title);
  const Description = $derived(parts.Description);
  const Close = $derived(parts.Close);
</script>
<MosaicHeader {icon}>
  <div class="modal-copy od-field od-fill">
    <Title class="modal-title">{title}</Title>
    <Description class="modal-desc">{description}</Description>
  </div>
  {#if close}<Close class="btn icon modal-x" aria-label="Close dialog"><Icon name="close" size={13} /></Close>{/if}
</MosaicHeader>