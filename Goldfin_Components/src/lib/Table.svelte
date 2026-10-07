<script>
  import { useId } from 'bits-ui';
  import { sortRows, nextDirection } from './table.js';
  import TableSortButton from './TableSortButton.svelte';
  import TableEmpty from './TableEmpty.svelte';
  let { columns = [], rows = [], label = 'Table', variant = 'contained', cell, rowKey = 'id', caption = '', empty = 'No rows to display.', ...rest } = $props();
  const id = useId();
  let key = $state('');
  let direction = $state('ascending');
  let feedback = $state('');
  const sorted = $derived(key ? sortRows(rows, key, direction) : rows);
  function sort(column) {
    direction = nextDirection(column.key, key, direction);
    key = column.key;
    feedback = column.label + ' sorted in ' + direction + ' order.';
  }
</script>
<div class="table-stack">
  {#if label}<h3 class="table-label" id={id}>{label}</h3>{/if}
  <div class="table-frame" data-variant={variant}>
    <table {...rest} class="data-table" aria-labelledby={label ? id : undefined}>
      <caption class="sr-only">{caption || label}</caption>
      <thead><tr>{#each columns as column (column.key)}
        <th scope="col" aria-sort={key === column.key ? direction : 'none'} style:width={column.width}>
          <TableSortButton {column} active={key === column.key} {direction} onsort={sort} />
        </th>
      {/each}</tr></thead>
      <tbody>{#each sorted as row, rowIndex (row[rowKey] ?? rowIndex)}<tr>{#each columns as column, index (column.key)}
        {#if index === 0}<th scope="row" class="table-primary" data-label={column.label}>{#if cell}{@render cell(row, column)}{:else}{row[column.key] ?? '—'}{/if}</th>
        {:else}<td data-label={column.label}>{#if cell}{@render cell(row, column)}{:else}{row[column.key] ?? '—'}{/if}</td>{/if}
      {/each}</tr>{/each}</tbody>
    </table>
    {#if !rows.length}<TableEmpty text={empty} />{/if}
  </div>
  <p class="sr-only" role="status">{feedback}</p>
</div>