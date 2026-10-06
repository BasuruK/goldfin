<script>
  import { Dialog as Primitive } from 'bits-ui';
  import MosaicHeader from './MosaicHeader.svelte';
  import Icon from './Icon.svelte';
  let { open = $bindable(false), trigger, title, description, children, actions, ...rest } = $props();
</script>
<Primitive.Root {...rest} bind:open>
  <Primitive.Trigger class="btn dialog-trigger">{trigger}</Primitive.Trigger>
  <Primitive.Portal>
    <Primitive.Overlay class="gf-overlay" />
    <Primitive.Content class="modal gf-modal">
      <MosaicHeader>
        <div class="modal-copy od-field od-fill">
          <Primitive.Title class="modal-title">{title}</Primitive.Title>
          <Primitive.Description class="modal-desc">{description}</Primitive.Description>
        </div>
        <Primitive.Close class="btn icon modal-x" aria-label="Close dialog"><Icon name="close" size={13} /></Primitive.Close>
      </MosaicHeader>
      <div class="modal-body">{@render children?.()}</div>
      <div class="modal-foot">
        <Primitive.Close class="btn">Cancel</Primitive.Close>
        {@render actions?.({ close: () => open = false })}
      </div>
    </Primitive.Content>
  </Primitive.Portal>
</Primitive.Root>