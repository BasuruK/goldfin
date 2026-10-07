<script>
  import { AlertDialog as Primitive } from 'bits-ui';
  import DialogHeader from './DialogHeader.svelte';
  import DialogBody from './DialogBody.svelte';
  import DialogFooter from './DialogFooter.svelte';
  import { createConfirmation } from './confirmation.js';
  let { open = $bindable(false), trigger, title, description, action = 'Confirm',
    tone = 'neutral', icon = 'link', onConfirm = () => {}, onResult, children, ...rest } = $props();
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
  <Primitive.Trigger class="{tone === 'bad' ? 'btn danger dialog-trigger' : 'btn dialog-trigger'}">{trigger}</Primitive.Trigger>
  <Primitive.Portal>
    <Primitive.Overlay class="gf-overlay" />
    <Primitive.Content class="modal modal-confirm gf-modal" data-tone={tone}
      interactOutsideBehavior="close" onInteractOutside={holdWhileBusy} onEscapeKeydown={holdWhileBusy}>
      <DialogHeader parts={Primitive} {title} {description} {icon} />
      {#if children}
        <DialogBody>
          {#if error}<p class="field-msg error gf-dialog-error" role="alert">{error}</p>{/if}
          {@render children()}
        </DialogBody>
      {:else if error}
        <p class="field-msg error gf-dialog-error" role="alert">{error}</p>
      {/if}
      <DialogFooter>
        {#snippet cancel()}<Primitive.Cancel class="btn" disabled={busy}>Cancel</Primitive.Cancel>{/snippet}
        <Primitive.Action class={tone === 'bad' ? 'btn danger' : 'btn primary'} onclick={confirm} disabled={busy} aria-busy={busy}>
          {busy ? 'Working…' : action}
        </Primitive.Action>
      </DialogFooter>
    </Primitive.Content>
  </Primitive.Portal>
</Primitive.Root>