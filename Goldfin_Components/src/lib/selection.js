/** @typedef {{ value: string, disabled?: boolean }} SelectionItem */

/** @param {SelectionItem[]} items */
const enabledValues = items => items.filter(item => !item.disabled).map(item => item.value);
/**
 * @param {string[]} selected
 * @param {SelectionItem[]} items
 */
export function selectionState(selected, items) {
  const count = items.filter(item => selected.includes(item.value)).length;
  const enabled = enabledValues(items);
  const enabledCount = enabled.filter(value => selected.includes(value)).length;
  return { count, checked: enabled.length > 0 && enabledCount === enabled.length,
    indeterminate: enabledCount > 0 && enabledCount < enabled.length };
}
/**
 * @param {string[]} selected
 * @param {SelectionItem[]} items
 * @param {boolean} checked
 */
export function toggleAll(selected, items, checked) {
  const enabled = enabledValues(items);
  const kept = selected.filter(value => !enabled.includes(value));
  return checked ? [...kept, ...enabled] : kept;
}
