<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import { Switch as Primitive, Label } from 'bits-ui';

  type SwitchRootProps = ComponentProps<typeof Primitive.Root>;

  export type SwitchControlProps = Omit<SwitchRootProps, 'id' | 'checked' | 'disabled'> & {
    id: string;
    checked?: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
    invalid?: boolean;
    badge?: boolean;
  };

  // Shared by Switch and SwitchCard: the switch, its thumb and the label/badge block.
  let {
    id,
    checked = $bindable(false),
    label,
    description = '',
    disabled = false,
    invalid = false,
    badge = false,
    ...rest
  }: SwitchControlProps = $props();
</script>
<Primitive.Root {...rest} {id} bind:checked {disabled} aria-invalid={invalid || undefined}
  aria-describedby={description ? id + '-help' : undefined} class="gf-switch">
  <Primitive.Thumb class="gf-switch-thumb" />
</Primitive.Root>
<Label.Root for={id} class="field-content">
  <span class="switch-card-title">
    <span class="label">{label}</span>
    {#if badge}<span class="switch-card-badge" data-on={checked}>{checked ? 'On' : 'Off'}</span>{/if}
  </span>
  {#if description}<span class="field-desc" id={id + '-help'}>{description}</span>{/if}
</Label.Root>