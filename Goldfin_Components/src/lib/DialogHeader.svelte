<script lang="ts">
  import { AlertDialog, Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import MosaicHeader from './MosaicHeader.svelte';
  import Icon from './Icon.svelte';

  type DialogParts = typeof Dialog | typeof AlertDialog;

  // `parts` is the bits-ui Dialog or AlertDialog namespace; Title/Description/Close differ between them.
  let {
    parts,
    title,
    description,
    icon = '',
    close = false,
    actions = undefined
  }: {
    parts: DialogParts;
    title: string;
    description: string;
    icon?: string;
    close?: boolean;
    actions?: Snippet;
  } = $props();
  const Title = $derived(parts.Title);
  const Description = $derived(parts.Description);
  const Close = $derived('Close' in parts ? parts.Close : undefined);
</script>
<MosaicHeader {icon}>
  <div class="modal-copy od-field od-fill">
    <Title class="modal-title">{title}</Title>
    <Description class="modal-desc">{description}</Description>
  </div>
  {#if actions || close}
    <div class="modal-head-end">
      {#if actions}{@render actions()}{/if}
      {#if close}
        <Close class="btn icon modal-x" aria-label="Close dialog">
          <Icon name="close" size={13} />
        </Close>
      {/if}
    </div>
  {/if}
</MosaicHeader>
