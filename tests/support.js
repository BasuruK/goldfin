/** The element's bounding box; throws when it has none, so a test fails at the lookup. */
/** @param {import('@playwright/test').Locator} locator */
export async function boxOf(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no bounding box`);
  return box;
}
