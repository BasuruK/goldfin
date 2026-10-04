<script>
  import { Slider as Primitive, useId } from 'bits-ui';
  import { formatValue } from './format.js';
  let { id = useId(), value = $bindable(0), label, min = 0, max = 100,
    step = 1, size = 'default', disabled = false, format = 'integer', unit = '',
    description = '', onValueChange, onValueCommit, ...rest } = $props();
  const text = $derived(formatValue(value, format));
</script>

<div class="slider-field od-stack" data-size={size}>
  <div class="slider-heading od-row">
    <span id={id + '-label'} class="label">{label}</span>
    <output class="slider-value od-nowrap">{text}</output>
  </div>
  <Primitive.Root {...rest} {id} type="single" bind:value {min} {max} {step}
    {disabled} {onValueChange} {onValueCommit} class="gf-slider"
    aria-labelledby={id + '-label'}>
    <span class="gf-slider-track"><Primitive.Range class="gf-slider-range" /></span>
    <Primitive.Thumb index={0} class="gf-slider-thumb"
      aria-labelledby={id + '-label'} aria-describedby={description ? id + '-description' : undefined}
      aria-valuetext={unit ? text + ' ' + unit : text}>
      <svg width="20" height="10" viewBox="0 0 20 10" fill="none" aria-hidden="true">
        <path d="M5 2 2 5l3 3M10 1v8M15 2l3 3-3 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </Primitive.Thumb>
  </Primitive.Root>
  {#if description}<p class="field-desc" id={id + '-description'}>{description}</p>{/if}
</div>
