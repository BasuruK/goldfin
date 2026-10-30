export type Direction = 'ascending' | 'descending';

export interface Column {
  key: string;
  label: string;
  width?: string;
}

export function compareValues(left: unknown, right: unknown, direction: Direction = 'ascending'): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const result =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right), 'en', { numeric: true, sensitivity: 'base' });
  return direction === 'descending' ? -result : result;
}

export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  key: string,
  direction?: Direction
): T[] {
  return [...rows].sort((left, right) => compareValues(left[key], right[key], direction));
}

export function nextDirection(columnKey: string, key: string, direction: Direction): Direction {
  return key === columnKey && direction === 'ascending' ? 'descending' : 'ascending';
}

export function sortLabel(columnLabel: string, direction: Direction): string {
  return 'Sort by ' + columnLabel + ', ' + direction + ' order';
}
