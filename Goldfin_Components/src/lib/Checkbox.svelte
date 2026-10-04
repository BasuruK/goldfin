<script>
  import { Checkbox as Primitive, Label, useId } from 'bits-ui';
  import Icon from './Icon.svelte';
  let { id = useId(), checked = $bindable(false), indeterminate = $bindable(false),
    label, description = '', disabled = false, invalid = false, 'aria-describedby': describedBy = '', ...rest } = $props();
</script>
<div class="ctl" data-type="check" data-checked={checked || undefined}
  data-disabled={disabled ? 'true' : undefined} data-invalid={invalid || undefined}>
  <Primitive.Root {...rest} {id} bind:checked bind:indeterminate {disabled}
    aria-invalid={invalid || undefined} aria-describedby={[describedBy, description ? id + '-help' : ''].filter(Boolean).join(' ') || undefined} class="gf-control gf-checkbox">
    {#snippet children({ checked, indeterminate })}
      {#if indeterminate}<Icon name="minus" size={12} />{:else if checked}<Icon name="check" size={12} />{/if}
    {/snippet}
  </Primitive.Root>
  <Label.Root for={id} class="field-content">
    <span class="label">{label}</span>
    {#if description}<span class="field-desc" id={id + '-help'}>{description}</span>{/if}
  </Label.Root>
</div>