<script>
  import { Select, Label, useId } from 'bits-ui';
  import Icon from './Icon.svelte';
  let { label, items, value = $bindable(''), placeholder = 'All statuses' } = $props();
  const id = useId();
  const selected = $derived(items.find(item => item.value === value));
</script>
<div class="dd">
  <Label.Root for={id} class="label">{label}</Label.Root>
  <Select.Root type="single" bind:value {items}>
    <Select.Trigger {id} class="dd-trigger">
      <span class="dd-lead"><span class="dot" aria-hidden="true" style:color={'var(--' + (selected?.tone || 'ufg3') + ')'}>●</span><span class="dd-label">{selected?.label || placeholder}</span></span>
      <Icon name="chevron" size={10} />
    </Select.Trigger>
    <Select.Portal><Select.Content class="dd-menu gf-menu" sideOffset={6}><Select.Viewport>
      {#each items as item (item.value)}
        <Select.Item value={item.value} label={item.label} class="dd-opt">
          <span class="dot" aria-hidden="true" style:color={'var(--' + (item.tone || 'ufg3') + ')'}>●</span>
          <span class="text od-field"><span class="id">{item.label}</span><span class="note">{item.note}</span></span>
        </Select.Item>
      {/each}
    </Select.Viewport></Select.Content></Select.Portal>
  </Select.Root>
</div>