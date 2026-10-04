<script>
  import { RadioGroup as Primitive, Label, useId } from 'bits-ui';
  let { id = useId(), value = $bindable(''), label, items, disabled = false, invalid = false, card = false, ...rest } = $props();
</script>
<Primitive.Root {...rest} bind:value {disabled} aria-label={label} class={['ctl-list', card && 'gf-radio-cards']}>
  {#each items as item, index (item.value)}
    <div class="ctl" data-type="radio" data-checked={value === item.value || undefined}
      data-disabled={disabled || item.disabled ? 'true' : undefined} data-invalid={invalid || undefined}>
      <Primitive.Item id={id + '-' + index} value={item.value} disabled={item.disabled}
        class="gf-control gf-radio" aria-invalid={invalid || undefined}>
        {#if value === item.value}<span class="gf-radio-dot"></span>{/if}
      </Primitive.Item>
      <Label.Root for={id + '-' + index} class="field-content">
        <span class="label">{item.label}</span>
        {#if item.description}<span class="field-desc">{item.description}</span>{/if}
      </Label.Root>
    </div>
  {/each}
</Primitive.Root>