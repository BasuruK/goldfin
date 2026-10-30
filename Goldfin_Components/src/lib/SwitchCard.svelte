<script lang="ts">
  import { useId } from 'bits-ui';
  import Icon from './Icon.svelte';
  import SwitchControl, { type SwitchControlProps } from './SwitchControl.svelte';

  type Props = Omit<SwitchControlProps, 'id'> & {
    id?: string;
    icon?: string;
    size?: string;
  };

  let {
    id = useId(),
    checked = $bindable(false),
    label,
    description = '',
    icon = 'settings',
    disabled = false,
    invalid = false,
    size = 'default',
    badge = false,
    ...rest
  }: Props = $props();
</script>
<div class="ctl switch-card gf-switch-card" data-type="switch" data-size={size} data-checked={checked || undefined}
  data-disabled={disabled ? 'true' : undefined} data-invalid={invalid || undefined}>
  <span class="switch-card-icon"><Icon name={icon} size={18} /></span>
  <SwitchControl {id} bind:checked {label} {description} {disabled} {invalid} {badge} {...rest} />
</div>