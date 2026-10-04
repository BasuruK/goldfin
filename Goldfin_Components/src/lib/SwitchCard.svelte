<script>
  import { Switch as Primitive, Label, useId } from 'bits-ui';
  import Icon from './Icon.svelte';
  let { id = useId(), checked = $bindable(false), label, description, icon = 'settings',
    disabled = false, size = 'default', badge = false, ...rest } = $props();
</script>
<div class="ctl switch-card gf-switch-card" data-type="switch" data-size={size} data-checked={checked || undefined}
  data-disabled={disabled ? 'true' : undefined}>
  <span class="switch-card-icon"><Icon name={icon} size={18} /></span>
  <Primitive.Root {...rest} {id} bind:checked {disabled} class="gf-switch" aria-describedby={description ? id + '-help' : undefined}>
    <Primitive.Thumb class="gf-switch-thumb" />
  </Primitive.Root>
  <Label.Root for={id} class="field-content">
    <span class="switch-card-title"><span class="label">{label}</span>
      {#if badge}<span class="switch-card-badge" data-on={checked}>{checked ? 'On' : 'Off'}</span>{/if}
    </span>
    {#if description}<span class="field-desc" id={id + '-help'}>{description}</span>{/if}
  </Label.Root>
</div>