export interface SelectionItem {
  value: string;
  disabled?: boolean;
}

const enabledValues = (items: SelectionItem[]) =>
  items.filter((item) => !item.disabled).map((item) => item.value);

export function selectionState(selected: string[], items: SelectionItem[]) {
  const count = items.filter((item) => selected.includes(item.value)).length;
  const enabled = enabledValues(items);
  const enabledCount = enabled.filter((value) => selected.includes(value)).length;
  return {
    count,
    checked: enabled.length > 0 && enabledCount === enabled.length,
    indeterminate: enabledCount > 0 && enabledCount < enabled.length
  };
}

export function toggleAll(selected: string[], items: SelectionItem[], checked: boolean): string[] {
  const enabled = enabledValues(items);
  const kept = selected.filter((value) => !enabled.includes(value));
  return checked ? [...kept, ...enabled] : kept;
}
