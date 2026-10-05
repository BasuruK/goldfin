import { test, expect, devices } from '@playwright/test';

/**
 * Touch-target checks. A separate file because devices[...] cannot be applied inside a
 * describe group — it forces a new worker, so it has to be top-level.
 */
test.use({ ...devices['Pixel 5'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1.page-title')).toBeVisible();
});

// If this fails, every other assertion in this file is meaningless: the media query
// that drives the 44px expansion never applied, so nothing was actually being tested.
test('the pointer really is coarse', async ({ page }) => {
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
});

test('the table sort control meets the 44px target on a touch device', async ({ page }) => {
  const sort = page.locator('.table-sort').first();
  await expect(sort).toBeVisible();
  const h = await sort.evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeGreaterThanOrEqual(44);
});

test('the segmented control indicator fills the taller touch segment', async ({ page }) => {
  const [thumb, button] = await page.locator('.seg').first().evaluate((el) =>
    [el.querySelector('.seg-thumb'), el.querySelector('.seg-btn')].map((node) => node!.getBoundingClientRect().height));
  expect(button).toBeGreaterThanOrEqual(44);
  expect(thumb).toBe(button);
});

test('coarse-pointer controls are not stacked on top of each other', async ({ page }) => {
  const sort = page.locator('.table-sort').first();
  const box = await sort.boundingBox();
  // WCAG 2.2 SC 2.5.8 spacing: neighbours must sit outside a 24px circle around the target.
  const crowded = await sort.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const probe = 24;
    for (const el2 of document.elementsFromPoint(cx, cy - probe)) {
      if (el2 !== el && el2.contains(el)) continue;
    }
    const above = document.elementFromPoint(cx, cy - probe);
    return !!above && above !== el && el.contains(above);
  });
  expect(crowded).toBe(false);
  expect(box).not.toBeNull();
});