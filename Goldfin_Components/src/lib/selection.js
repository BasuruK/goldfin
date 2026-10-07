export function selectionState(selected, items) {
  const count = items.filter(item => selected.includes(item.value)).length;
  return { count, checked: items.length > 0 && count === items.length,
    indeterminate: count > 0 && count < items.length };
}
export function toggleAll(selected, items, checked) {
  if (!checked) return selected.filter(value => !items.some(item => item.value === value));
  const values = items.filter(item => !item.disabled).map(item => item.value);
  return [...selected.filter(value => !items.some(item => item.value === value)), ...values];
}