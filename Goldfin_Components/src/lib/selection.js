export function selectionState(selected, items) {
  const count = items.filter(item => selected.includes(item.value)).length;
  return { count, checked: items.length > 0 && count === items.length,
    indeterminate: count > 0 && count < items.length };
}
