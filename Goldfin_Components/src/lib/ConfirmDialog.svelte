<script lang="ts">
  import { AlertDialog as Primitive } from 'bits-ui';
  import DialogHeader from './DialogHeader.svelte';
  import DialogBody from './DialogBody.svelte';
  import DialogFooter from './DialogFooter.svelte';
  import Icon from './Icon.svelte';
  import type { ComponentProps, Snippet } from 'svelte';
  import { createConfirmation, type ConfirmationResult } from './confirmation.js';

  type AlertDialogRootProps = ComponentProps<typeof Primitive.Root>;

  type Props = Omit<AlertDialogRootProps, 'open' | 'onOpenChange'> & {
    open?: boolean;
    trigger: string;
    iconTrigger?: boolean;
    title: string;
    description: string;
    action?: string;
    tone?: string;
    icon?: string;
    onConfirm?: () => void | Promise<void>;
    onResult?: (result: ConfirmationResult) => void;
    children?: Snippet;
  };

  let {
    open = $bindable(false),
    trigger,
    iconTrigger = false,
    title,
    description,
    action = 'Confirm',
    tone = 'neutral',
    icon = 'link',
    onConfirm = () => {},
    onResult = undefined,
    children = undefined,
    ...rest
  }: Props = $props();
  const triggerClass = $derived(
    iconTrigger
      ? `btn icon dialog-icon-trigger${tone === 'bad' ? ' dialog-icon-trigger--bad' : ''}`
      : tone === 'bad'
        ? 'btn danger dialog-trigger'
        : 'btn dialog-trigger'
  );
  let busy = $state(false);
  let error = $state('');
  const result = createConfirmation(value => onResult?.(value));
  function changed(next: boolean) {
    if (next) {
      result.begin();
      error = '';
    } else {
      result.close();
    }
  }
  async function confirm() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await onConfirm();
      result.confirm();
      result.close();
      open = false;
    } catch {
      error = 'The action failed. Try again or cancel.';
    } finally { busy = false; }
  }
  function holdWhileBusy(event: Event) {
    if (busy) event.preventDefault();
  }
</script>
<Primitive.Root {...rest} bind:open onOpenChange={changed}>
  <Primitive.Trigger class={triggerClass} aria-label={iconTrigger ? trigger : undefined}>
    {#if iconTrigger}
      <Icon name={icon} size={16} />
    {:else}
      {trigger}
    {/if}
  </Primitive.Trigger>
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
        <Primitive.Action
          class={tone === 'bad' ? 'btn danger' : 'btn primary'}
          onclick={confirm}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Working…' : action}
        </Primitive.Action>
      </DialogFooter>
    </Primitive.Content>
  </Primitive.Portal>
</Primitive.Root>
