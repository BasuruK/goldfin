<script>
  import { Select as Primitive, Label, useId } from 'bits-ui';
  import Icon from './Icon.svelte';
  let { id = useId(), type = 'single', value = $bindable(type === 'multiple' ? [] : ''), items, label,
    placeholder = 'Select an option', disabled = false, ...rest } = $props();
  const selected = $derived(type === 'multiple' ? value.length + ' selected' : items.find(item => item.value === value)?.label || placeholder);
</script>
<div class="dd">
  <Label.Root for={id} class="label">{label}</Label.Root>
  <Primitive.Root {...rest} {type} {items} bind:value {disabled}>
    <Primitive.Trigger {id} class="dd-trigger"><span class="dd-label">{selected}</span><Icon name="chevron" size={10} /></Primitive.Trigger>
    <Primitive.Portal>
      <Primitive.Content class="dd-menu gf-menu" sideOffset={6}>
        <Primitive.Viewport>
          {#each items as item (item.value)}
            <Primitive.Item value={item.value} label={item.label} disabled={item.disabled} class="dd-opt">
              {#snippet children({ selected })}
                <span class="check">{#if selected}<Icon name="check" size={12} />{/if}</span>
                <span class="text od-field"><span class="id">{item.label}</span>{#if item.note}<span class="note">{item.note}</span>{/if}</span>
              {/snippet}
            </Primitive.Item>
          {/each}
        </Primitive.Viewport>
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>
</div>