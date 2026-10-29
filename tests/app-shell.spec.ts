import { expect, test } from '@playwright/test';
import { boxOf } from './support.js';

test('static app shell loads with the approved dark theme', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page).toHaveTitle('Home · Goldfin');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByText('Goldfin', { exact: true })).toBeVisible();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveCSS('color-scheme', 'dark');
  const pageColor = await page.locator('body').evaluate((body) =>
    getComputedStyle(body).getPropertyValue('--ubg').trim()
  );
  expect(pageColor).toContain('16.41%');
  expect(errors).toEqual([]);
});

test('the sidebar collapses to a rail and reopens using the keyboard', async ({ page }) => {
  await page.goto('/');

  const sidebar = page.locator('#primary-nav');
  const toggle = page.getByRole('button', { name: 'Collapse navigation' });
  const expandedWidth = (await boxOf(sidebar)).width;

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.focus();
  await page.keyboard.press('Enter');

  const expandToggle = page.getByRole('button', { name: 'Expand navigation' });
  await expect(expandToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(expandToggle).toBeFocused();
  await expect(page.getByText('Goldfin', { exact: true })).toBeHidden();
  // The rail uses --duration-sidebar (300ms cap), so poll for the settled width
  // rather than sampling mid-transition.
  await expect.poll(() => sidebar.evaluate((el) => el.getBoundingClientRect().width))
    .toBeLessThan(expandedWidth);

  await page.keyboard.press('Space');

  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Goldfin', { exact: true })).toBeVisible();
  await expect.poll(() => sidebar.evaluate((el) => el.getBoundingClientRect().width))
    .toBe(expandedWidth);
});
