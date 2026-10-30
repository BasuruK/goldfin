<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import { Checkbox as Primitive, Label, useId } from 'bits-ui';
  import Icon from './Icon.svelte';

  type CheckboxRootProps = ComponentProps<typeof Primitive.Root>;

  type Props = Omit<
    CheckboxRootProps,
    'id' | 'checked' | 'indeterminate' | 'disabled' | 'aria-describedby'
  > & {
    id?: string;
    checked?: boolean;
    indeterminate?: boolean;
    label: string;
    description?: string;
    disabled?: boolean;
    invalid?: boolean;
    'aria-describedby'?: string;
  };

  let {
    id = useId(),
    checked = $bindable(false),
    indeterminate = $bindable(false),
    label,
    description = '',
    disabled = false,
    invalid = false,
    'aria-describedby': describedBy = '',
    ...rest
  }: Props = $props();
</script>
<div class="ctl" data-type="check" data-checked={checked || undefined}
  data-disabled={disabled ? 'true' : undefined} data-invalid={invalid || undefined}>
  <Primitive.Root {...rest} {id} bind:checked bind:indeterminate {disabled}
    aria-invalid={invalid || undefined}
    aria-describedby={[describedBy, description ? id + '-help' : ''].filter(Boolean).join(' ') || undefined}
    class="gf-control gf-checkbox">
    {#snippet children({ checked, indeterminate })}
      {#if indeterminate}
        <Icon name="minus" size={12} />
      {:else if checked}
        <Icon name="check" size={12} />
      {/if}
    {/snippet}
  </Primitive.Root>
  <Label.Root for={id} class="field-content">
    <span class="label">{label}</span>
    {#if description}<span class="field-desc" id={id + '-help'}>{description}</span>{/if}
  </Label.Root>
</div>