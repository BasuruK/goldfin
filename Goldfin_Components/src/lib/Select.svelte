<script lang="ts">
  import { Select as Primitive, Label, useId } from 'bits-ui';
  import Icon from './Icon.svelte';

  export interface SelectItem {
    value: string;
    label: string;
    disabled?: boolean;
    tone?: string;
    note?: string;
  }

  type SelectSharedProps = {
    id?: string;
    items: readonly SelectItem[];
    label: string;
    placeholder?: string;
    disabled?: boolean;
    tone?: boolean;
    summary?: (count: number) => string;
  };

  export type SelectSingleProps = SelectSharedProps & {
    type?: 'single';
    value?: string;
  };

  export type SelectMultipleProps = SelectSharedProps & {
    type: 'multiple';
    value?: string[];
  };

  export type SelectProps = SelectSingleProps | SelectMultipleProps;

  let {
    id = useId(),
    type = 'single',
    value = $bindable(type === 'multiple' ? ([] as string[]) : ('' as string)),
    items,
    label,
    placeholder = 'Select an option',
    disabled = false,
    tone = false,
    summary = (count: number) => count + ' selected',
    ...rest
  }: SelectProps = $props();
  const picked = $derived(items.find((item) => item.value === value));
  const selected = $derived(
    type === 'multiple' ? summary(Array.isArray(value) ? value.length : 0) : picked?.label || placeholder
  );
  function dotColor(item: Pick<SelectItem, 'tone'>) {
    return 'var(--' + (item.tone || 'ufg3') + ')';
  }
</script>
<div class="dd">
  <Label.Root for={id} class="label">{label}</Label.Root>
  <Primitive.Root
    {...rest}
    type={type === 'multiple' ? 'multiple' : 'single'}
    items={[...items]}
    bind:value={value as never}
    {disabled}
  >
    <Primitive.Trigger {id} class="dd-trigger">
      {#if tone}
        <span class="dd-lead">
          <span class="dot" aria-hidden="true" style:color={dotColor(picked || {})}>●</span>
          <span class="dd-label">{selected}</span>
        </span>
      {:else}
        <span class="dd-label">{selected}</span>
      {/if}
      <Icon name="chevron" size={10} />
    </Primitive.Trigger>
    <Primitive.Portal>
      <Primitive.Content class="dd-menu gf-menu" sideOffset={6}>
        <Primitive.Viewport>
          {#each items as item (item.value)}
            <Primitive.Item value={item.value} label={item.label} disabled={item.disabled} class="dd-opt">
              {#snippet children({ selected })}
                {#if item.tone}
                  <span class="dot" aria-hidden="true" style:color={dotColor(item)}>●</span>
                {:else}
                  <span class="check">{#if selected}<Icon name="check" size={12} />{/if}</span>
                {/if}
                <span class="text od-field">
                  <span class="id">{item.label}</span>
                  {#if item.note}<span class="note">{item.note}</span>{/if}
                </span>
              {/snippet}
            </Primitive.Item>
          {/each}
        </Primitive.Viewport>
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>
</div>
