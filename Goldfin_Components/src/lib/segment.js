// Selection and indicator geometry for the segmented control. Which item is
// selected, and where the indicator sits, are decided here so the component is
// left with rendering only.

export function resolveValue(value, items = []) {
  return items.some(item => item.value === value) ? value : items[0]?.value;
}

export function activeIndex(value, items = []) {
  const selected = resolveValue(value, items);
  const found = items.findIndex(item => item.value === selected);
  return found < 0 ? 0 : found;
}

export function thumbVars(boxes, index) {
  const box = boxes?.[index];
  if (!box) return null;
  return { x: `${box.x}px`, width: `${box.width}px` };
}

export function shouldSlide(previous, next) {
  return previous !== null && previous !== next;
}
