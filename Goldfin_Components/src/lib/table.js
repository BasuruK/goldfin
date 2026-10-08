export function compareValues(left, right, direction = 'ascending') {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const result = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'base' });
  return direction === 'descending' ? -result : result;
}
export function sortRows(rows, key, direction) {
  return [...rows].sort((left, right) => compareValues(left[key], right[key], direction));
}
export function nextDirection(columnKey, key, direction) {
  return key === columnKey && direction === 'ascending' ? 'descending' : 'ascending';
}
export function sortLabel(columnLabel, direction) {
  return 'Sort by ' + columnLabel + ', ' + direction + ' order';
}
