<script>
  import { sortLabel } from './table.js';
  let { column, active = false, direction = 'ascending', onsort } = $props();
  // The button announces the direction a click will move to, not the current one.
  const next = $derived(active && direction === 'ascending' ? 'descending' : 'ascending');
</script>
<button class="table-sort" type="button" onclick={() => onsort?.(column)}
  aria-label={sortLabel(column.label, next)}>
  <span>{column.label}</span><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path class="sort-up" d="m3 4 3-3 3 3"/><path class="sort-down" d="m3 8 3 3 3-3"/></svg>
</button>