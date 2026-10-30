<script lang="ts">
  import { useId } from 'bits-ui';
  import SwitchControl, { type SwitchControlProps } from './SwitchControl.svelte';

  type Props = Omit<SwitchControlProps, 'id'> & {
    id?: string;
    size?: string;
  };

  let {
    id = useId(),
    checked = $bindable(false),
    label,
    description = '',
    disabled = false,
    invalid = false,
    size = 'default',
    badge = false,
    ...rest
  }: Props = $props();
</script>
<div class="ctl" data-type="switch" data-size={size} data-checked={checked || undefined}
  data-disabled={disabled ? 'true' : undefined} data-invalid={invalid || undefined}>
  <SwitchControl {id} bind:checked {label} {description} {disabled} {invalid} {badge} {...rest} />
</div>