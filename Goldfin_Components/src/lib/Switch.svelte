<script>
  import { Switch as Primitive, Label, useId } from 'bits-ui';
  let { id = useId(), checked = $bindable(false), label, description = '',
    disabled = false, invalid = false, size = 'default', badge = false, ...rest } = $props();
</script>
<div class="ctl" data-type="switch" data-size={size} data-checked={checked || undefined}
  data-disabled={disabled ? 'true' : undefined} data-invalid={invalid || undefined}>
  <Primitive.Root {...rest} {id} bind:checked {disabled} aria-invalid={invalid || undefined}
    aria-describedby={description ? id + '-help' : undefined} class="gf-switch">
    <Primitive.Thumb class="gf-switch-thumb" />
  </Primitive.Root>
  <Label.Root for={id} class="field-content">
    <span class="switch-card-title"><span class="label">{label}</span>
      {#if badge}<span class="switch-card-badge" data-on={checked}>{checked ? 'On' : 'Off'}</span>{/if}
    </span>
    {#if description}<span class="field-desc" id={id + '-help'}>{description}</span>{/if}
  </Label.Root>
</div>