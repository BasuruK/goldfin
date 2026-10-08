<script>
  import { Dialog as Primitive } from 'bits-ui';
  import DialogHeader from './DialogHeader.svelte';
  import DialogBody from './DialogBody.svelte';
  import DialogFooter from './DialogFooter.svelte';
  let { open = $bindable(false), trigger, title, description, icon = '', children, actions, ...rest } = $props();
</script>
<Primitive.Root {...rest} bind:open>
  <Primitive.Trigger class="btn dialog-trigger">{trigger}</Primitive.Trigger>
  <Primitive.Portal>
    <Primitive.Overlay class="gf-overlay" />
    <Primitive.Content class="modal gf-modal">
      <DialogHeader parts={Primitive} {title} {description} {icon} close />
      <DialogBody>{@render children?.()}</DialogBody>
      <DialogFooter>
        {#snippet cancel()}<Primitive.Close class="btn">Cancel</Primitive.Close>{/snippet}
        {@render actions?.({ close: () => open = false })}
      </DialogFooter>
    </Primitive.Content>
  </Primitive.Portal>
</Primitive.Root>