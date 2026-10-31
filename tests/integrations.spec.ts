import { expect, test } from '@playwright/test';
import { boxOf, mockConnectorApi, selectProvider } from './support.ts';

test('Integrations expands without navigation and opens Connectors from the rail', async ({ page }) => {
  await page.goto('/');
  const group = page.getByRole('button', { name: 'Integrations', exact: true });
  const connectorLink = page.getByRole('link', { name: 'Connectors', exact: true });
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await group.focus();
  await page.keyboard.press('Enter');
  await expect(connectorLink).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await connectorLink.click();
  await expect(page).toHaveURL(/\/connectors\/$/);
  await expect(connectorLink).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
  await expect(connectorLink).toBeHidden();
  await group.click();
  await expect(connectorLink).toBeVisible();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
});

test('manual models start disabled, toggle in the draft, and block after connection changes', async ({ page }) => {
  const outbound: string[] = [];
  page.on('request', request => {
    if (request.url().includes('api.openai.com')) outbound.push(request.url());
  });
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Preview models', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Models', exact: true })).toBeVisible();
  await dialog.getByLabel('Model ID', { exact: true }).fill('my-deployment');
  await dialog.getByLabel('Model ID', { exact: true }).press('Enter');
  const model = dialog.getByRole('switch', { name: 'my-deployment', exact: true });
  await expect(model).toHaveAttribute('aria-checked', 'false');
  await model.click();
  await expect(model).toHaveAttribute('aria-checked', 'true');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://changed.example/v1');
  await expect(model).toBeDisabled();
  expect(outbound).toEqual([]);
});

test('web request allows explicit unverified manual IDs', async ({ page }) => {
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await selectProvider(dialog, 'Web Request');
  await dialog.getByLabel('Model ID', { exact: true }).fill('custom-model');
  await dialog.getByLabel('Model ID', { exact: true }).press('Enter');
  await expect(dialog.getByRole('switch', { name: 'custom-model', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(dialog.getByText('Unverified', { exact: true })).toBeVisible();
});

test('model panel reveals through intermediate frames when motion is allowed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  const addButton = page.getByRole('button', { name: 'Add connector', exact: true });
  await expect(addButton).toBeVisible();
  const frames = await addButton.evaluate(async button => {
    if (!(button instanceof HTMLElement)) throw new Error('Add connector control is not an HTML button');
    const readOpacityFrames = async () => {
      const seen: number[] = [];
      for (let frame = 0; frame < 20; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const panel = document.querySelector('.model-panel');
        seen.push(panel ? Number(getComputedStyle(panel).opacity) : Number.NaN);
      }
      return seen;
    };
    button.click();
    return readOpacityFrames();
  });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Models', exact: true })).toBeVisible();
  expect(frames.some(opacity => opacity > 0 && opacity < 1)).toBe(true);
  expect(frames.at(-1)).toBe(1);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 720 }]) {
  test(`model panel fits ${viewport.width}px with reduced motion and keyboard access`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockConnectorApi(page);
    await page.goto('/connectors/');
    await page.getByRole('button', { name: 'Add connector', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Model ID', { exact: true }).fill('my-deployment');
    await dialog.getByLabel('Model ID', { exact: true }).press('Enter');
    const panel = dialog.locator('.model-panel');
    await expect(panel).toHaveCSS('transform', 'none');
    const formBox = await boxOf(dialog.locator('.connector-form-panel'));
    const panelBox = await boxOf(panel);
    if (viewport.width > 800) expect(panelBox.x).toBeGreaterThanOrEqual(formBox.x + formBox.width);
    else expect(panelBox.y).toBeGreaterThanOrEqual(formBox.y + formBox.height);
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width);
    const model = dialog.getByRole('switch', { name: 'my-deployment', exact: true });
    await model.focus();
    await page.keyboard.press('Space');
    await expect(model).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: `test-results/model-panel-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add connector', exact: true })).toBeFocused();
  });
}
