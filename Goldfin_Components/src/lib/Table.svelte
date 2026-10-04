<script>
  import { useId } from 'bits-ui';
  import { sortRows } from './table.js';
  let { columns = [], rows = [], label = 'Table', variant = 'contained', cell, rowKey = 'id', caption = '', ...rest } = $props();
  const id = useId();
  let key = $state('');
  let direction = $state('ascending');
  let feedback = $state('');
  const sorted = $derived(key ? sortRows(rows, key, direction) : rows);
  function sort(column) {
    direction = key === column.key && direction === 'ascending' ? 'descending' : 'ascending';
    key = column.key;
    feedback = column.label + ' sorted in ' + direction + ' order.';
  }
</script>
<div class="table-stack">
  <h3 class="table-label" id={id}>{label}</h3>
  <div class="table-frame" data-variant={variant}>
    <table {...rest} class="data-table" aria-labelledby={id}>
      <caption class="sr-only">{caption || label}</caption>
      <thead><tr>{#each columns as column (column.key)}
        <th scope="col" aria-sort={key === column.key ? direction : 'none'} style:width={column.width}>
          <button class="table-sort" type="button" onclick={() => sort(column)} aria-label={'Sort by ' + column.label + ', ' + (key === column.key && direction === 'ascending' ? 'descending' : 'ascending') + ' order'}>
            <span>{column.label}</span><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path class="sort-up" d="m3 4 3-3 3 3"/><path class="sort-down" d="m3 8 3 3 3-3"/></svg>
          </button>
        </th>
      {/each}</tr></thead>
      <tbody>{#each sorted as row, rowIndex (row[rowKey] ?? rowIndex)}<tr>{#each columns as column, index (column.key)}
        {#if index === 0}<th scope="row" class="table-primary" data-label={column.label}>{#if cell}{@render cell(row, column)}{:else}{row[column.key] ?? '—'}{/if}</th>
        {:else}<td data-label={column.label}>{#if cell}{@render cell(row, column)}{:else}{row[column.key] ?? '—'}{/if}</td>{/if}
      {/each}</tr>{/each}</tbody>
    </table>
    {#if !rows.length}<p class="field-desc" style="padding:16px">No rows to display.</p>{/if}
  </div>
  <p class="sr-only" role="status">{feedback}</p>
</div>