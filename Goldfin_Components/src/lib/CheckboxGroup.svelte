<script>
  import Checkbox from './Checkbox.svelte';
  import { selectionState, toggleAll } from './selection.js';
  let { label = 'Select all', items, selected = $bindable([]), selectAll = true, card = false } = $props();
  const state = $derived(selectionState(selected, items));
  function toggle(value, checked) {
    selected = checked ? [...selected.filter(v => v !== value), value] : selected.filter(v => v !== value);
  }
</script>
<div class={['ctl-list', card && 'gf-check-cards']}>
  {#if selectAll}<Checkbox {label} checked={state.checked} indeterminate={state.indeterminate}
    onCheckedChange={checked => selected = toggleAll(selected, items, checked)} />{/if}
  {#each items as item (item.value)}
    <Checkbox label={item.label} description={item.description || ''} disabled={item.disabled || false}
      checked={selected.includes(item.value)} invalid={item.invalid || false}
      onCheckedChange={checked => toggle(item.value, checked)} />
  {/each}
  <p class="field-desc" role="status">{state.count} of {items.length} selected</p>
</div>

<style>
  /* The checkbox itself is a child component, so its .ctl box needs the card edge. */
  .gf-check-cards :global(.ctl) { border: 1px solid var(--uline); border-radius: 8px; padding: 12px; }
</style>