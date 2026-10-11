// Selection for the segmented control. Which item is selected is decided here;
// where the indicator sits is CSS anchor positioning in SegmentedControl.svelte.

export function resolveValue(value, items = []) {
  return items.some(item => item.value === value) ? value : items[0]?.value;
}
