<script>
  import Checkbox from './Checkbox.svelte';
  import { selectionState } from './selection.js';
  let { label = 'Select all', items, selected = $bindable([]) } = $props();
  const state = $derived(selectionState(selected, items));
  function toggle(value, checked) {
    selected = checked ? [...selected.filter(v => v !== value), value] : selected.filter(v => v !== value);
  }
</script>
<div class="ctl-list">
  <Checkbox {label} checked={state.checked} indeterminate={state.indeterminate}
    onCheckedChange={checked => selected = checked ? items.map(item => item.value) : []} />
  {#each items as item (item.value)}
    <Checkbox label={item.label} checked={selected.includes(item.value)}
      onCheckedChange={checked => toggle(item.value, checked)} />
  {/each}
  <p class="field-desc" role="status">{state.count} of {items.length} selected</p>
</div>