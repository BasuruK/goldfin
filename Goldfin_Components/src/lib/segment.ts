export interface SegmentItem {
  value: string;
}

export function resolveValue(value: string | undefined, items: readonly SegmentItem[] = []): string | undefined {
  return items.some((item) => item.value === value) ? value : items[0]?.value;
}
