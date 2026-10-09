import { expect, test } from '@playwright/test';

test('static app shell loads with the approved dark theme', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Goldfin');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByText('Goldfin', { exact: true })).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('color-scheme', 'dark');
  const pageColor = await page.locator('body').evaluate((body) =>
    getComputedStyle(body).getPropertyValue('--ubg').trim()
  );
  expect(pageColor).toContain('18.196%');
  expect(errors).toEqual([]);
});

test('sidebar collapses to a rail and reopens using the keyboard', async ({ page }) => {
  await page.goto('/');

  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  const navigation = page.getByRole('navigation', { name: 'Primary' });
  const toggle = page.getByRole('button', { name: 'Collapse sidebar' });
  const expandedWidth = (await sidebar.boundingBox()).width;

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.focus();
  await page.keyboard.press('Enter');

  const expandToggle = page.getByRole('button', { name: 'Expand sidebar' });
  await expect(expandToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(expandToggle).toBeFocused();
  await expect(page.getByText('Goldfin', { exact: true })).toBeHidden();
  await expect(navigation).toBeVisible();
  expect((await sidebar.boundingBox()).width).toBeLessThan(expandedWidth);

  await page.keyboard.press('Space');

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Goldfin', { exact: true })).toBeVisible();
  expect((await sidebar.boundingBox()).width).toBe(expandedWidth);
});
