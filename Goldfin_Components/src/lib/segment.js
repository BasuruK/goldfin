// Selection for the segmented control. Which item is selected is decided here;
// where the indicator sits is CSS anchor positioning in SegmentedControl.svelte.

/**
 * @param {string | undefined} value
 * @param {{ value: string }[]} [items]
 * @returns {string | undefined}
 */
export function resolveValue(value, items = []) {
  return items.some(item => item.value === value) ? value : items[0]?.value;
}
