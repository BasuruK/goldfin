<script>
  import { AlertDialog as Primitive } from 'bits-ui';
  import MosaicHeader from './MosaicHeader.svelte';
  import { createConfirmation } from './confirmation.js';
  let { open = $bindable(false), trigger, title, description, action = 'Confirm',
    tone = 'neutral', icon = 'link', onConfirm = () => {}, onResult, ...rest } = $props();
  let busy = $state(false);
  let error = $state('');
  const result = createConfirmation(value => onResult?.(value));
  function changed(next) {
    if (next) { result.begin(); error = ''; }
    else result.close();
  }
  async function confirm() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await onConfirm();
      result.confirm(); result.close(); open = false;
    } catch {
      error = 'The action failed. Try again or cancel.';
    } finally { busy = false; }
  }
  function holdWhileBusy(event) { if (busy) event.preventDefault(); }
</script>
<Primitive.Root {...rest} bind:open onOpenChange={changed}>
  <Primitive.Trigger class={tone === 'bad' ? 'btn danger' : 'btn'}>{trigger}</Primitive.Trigger>
  <Primitive.Portal>
    <Primitive.Overlay class="gf-overlay" />
    <Primitive.Content class="modal modal-confirm gf-modal" data-tone={tone}
      interactOutsideBehavior="close" onInteractOutside={holdWhileBusy} onEscapeKeydown={holdWhileBusy}>
      <MosaicHeader {icon}>
        <div class="modal-copy od-field od-fill">
          <Primitive.Title class="modal-title">{title}</Primitive.Title>
          <Primitive.Description class="modal-desc">{description}</Primitive.Description>
        </div>
      </MosaicHeader>
      {#if error}<p class="field-msg error gf-dialog-error" role="alert">{error}</p>{/if}
      <div class="modal-foot">
        <Primitive.Cancel class="btn" disabled={busy}>Cancel</Primitive.Cancel>
        <Primitive.Action class={tone === 'bad' ? 'btn danger' : 'btn primary'} onclick={confirm} disabled={busy} aria-busy={busy}>
          {busy ? 'Working…' : action}
        </Primitive.Action>
      </div>
    </Primitive.Content>
  </Primitive.Portal>
</Primitive.Root>