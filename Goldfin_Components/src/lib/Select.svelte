<script>
  import { Select as Primitive, Label, useId } from 'bits-ui';
  import Icon from './Icon.svelte';
  let { id = useId(), type = 'single', value = $bindable(type === 'multiple' ? [] : ''), items, label,
    placeholder = 'Select an option', disabled = false, tone = false, summary = count => count + ' selected', ...rest } = $props();
  const picked = $derived(items.find(item => item.value === value));
  const selected = $derived(type === 'multiple' ? summary(value.length) : picked?.label || placeholder);
  // Tone colour always comes from a token; ufg3 is the neutral fallback.
  function dotColor(item) { return 'var(--' + (item.tone || 'ufg3') + ')'; }
</script>
<div class="dd">
  <Label.Root for={id} class="label">{label}</Label.Root>
  <Primitive.Root {...rest} {type} {items} bind:value {disabled}>
    <Primitive.Trigger {id} class="dd-trigger">
      {#if tone}<span class="dd-lead"><span class="dot" aria-hidden="true" style:color={dotColor(picked || {})}>●</span><span class="dd-label">{selected}</span></span>
      {:else}<span class="dd-label">{selected}</span>{/if}
      <Icon name="chevron" size={10} />
    </Primitive.Trigger>
    <Primitive.Portal>
      <Primitive.Content class="dd-menu gf-menu" sideOffset={6}>
        <Primitive.Viewport>
          {#each items as item (item.value)}
            <Primitive.Item value={item.value} label={item.label} disabled={item.disabled} class="dd-opt">
              {#snippet children({ selected })}
                {#if item.tone}<span class="dot" aria-hidden="true" style:color={dotColor(item)}>●</span>
                {:else}<span class="check">{#if selected}<Icon name="check" size={12} />{/if}</span>{/if}
                <span class="text od-field"><span class="id">{item.label}</span>{#if item.note}<span class="note">{item.note}</span>{/if}</span>
              {/snippet}
            </Primitive.Item>
          {/each}
        </Primitive.Viewport>
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>
</div>