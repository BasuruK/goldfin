import { expect, test } from '@playwright/test';
import { mockDiscovery, mockVerification } from './mock-discovery.js';

const DISCOVERY_IDS = ['sample-chat-small', 'sample-chat-large', 'sample-reasoning'];

async function mockModelDiscovery(page) {
  await mockDiscovery(page, 'attempt-1', {
    state: 'ready',
    ids: DISCOVERY_IDS,
    source: 'discovered',
    message: `${DISCOVERY_IDS.length} models discovered.`
  });
}

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

test('model discovery starts disabled, saves toggles, and blocks them after connection changes', async ({ page }) => {
  const outbound = [];
  page.on('request', request => {
    if (request.url().includes('api.openai.com')) outbound.push(request.url());
  });
  await mockModelDiscovery(page);
  await mockVerification(page, { state: 'ready', verified: true });
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('API Key', { exact: true }).fill('sk-test');
  await dialog.getByRole('button', { name: 'Discover models', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Models', exact: true })).toBeVisible();
  await expect(dialog.getByText(/models discovered/i)).toBeVisible();
  const model = dialog.getByRole('switch', { name: 'sample-chat-small', exact: true });
  await expect(model).toHaveAttribute('aria-checked', 'false');
  await model.click();
  await expect(model).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await expect(model).toHaveAttribute('aria-checked', 'true');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://changed.example/v1');
  await expect(model).toBeDisabled();
  await dialog.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
  await expect(model).toBeEnabled();
  await expect(model).toHaveAttribute('aria-checked', 'true');
  expect(outbound).toEqual([]);
});

test('failed verification with a message turns the model back off', async ({ page }) => {
  await mockModelDiscovery(page);
  await mockVerification(page, {
    state: 'ready',
    verified: false,
    message: 'Authentication failed during verification.'
  });
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('API Key', { exact: true }).fill('sk-test');
  await dialog.getByRole('button', { name: 'Discover models', exact: true }).click();
  const model = dialog.getByRole('switch', { name: 'sample-chat-small', exact: true });
  await model.click();
  await expect(dialog.getByText('Authentication failed during verification.', { exact: true })).toBeVisible();
  await expect(model).toHaveAttribute('aria-checked', 'false');
});

test('unsupported discovery allows explicit unverified manual IDs', async ({ page }) => {
  await mockDiscovery(page, 'attempt-unsupported', {
    state: 'unsupported',
    message: 'Add a model ID manually.'
  });
  await page.addInitScript(() => localStorage.setItem('goldfin.connectors.v1', JSON.stringify([{
    id: 'manual', providerType: 'web_request', name: 'Custom gateway', baseUrl: 'https://example.com', apiKey: '', connectionStatus: 'idle', models: []
  }])));
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Discover models', exact: true }).click();
  await dialog.getByLabel('Model ID', { exact: true }).fill('custom-model');
  await dialog.getByLabel('Model ID', { exact: true }).press('Enter');
  await expect(dialog.getByRole('switch', { name: 'custom-model', exact: true })).toHaveAttribute('aria-checked', 'false');
  await expect(dialog.getByText('Unverified', { exact: true })).toBeVisible();
});

test('model panel reveals through intermediate frames when motion is allowed', async ({ page }) => {
  await mockModelDiscovery(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  await dialogFillApiKey(page);
  await expect(page.getByRole('button', { name: 'Discover models', exact: true })).toBeVisible();
  const frames = await page.evaluate(async () => {
    [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Discover models').click();
    const seen = [];
    for (let frame = 0; frame < 20; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const panel = document.querySelector('.model-panel');
      if (panel) seen.push(Number(getComputedStyle(panel).opacity));
    }
    return seen;
  });
  expect(frames.some(opacity => opacity > 0 && opacity < 1)).toBe(true);
  expect(frames.at(-1)).toBe(1);
});

/** @param {import('@playwright/test').Page} page */
async function dialogFillApiKey(page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('API Key', { exact: true }).fill('sk-test');
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 720 }]) {
  test(`model panel fits ${viewport.width}px with reduced motion and keyboard access`, async ({ page }) => {
    await mockModelDiscovery(page);
    await mockVerification(page, { state: 'ready', verified: true });
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/connectors/');
    await page.getByRole('button', { name: 'Add connector', exact: true }).click();
    await dialogFillApiKey(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Discover models', exact: true }).click();
    const panel = dialog.locator('.model-panel');
    await expect(panel).toHaveCSS('transform', 'none');
    const formBox = await dialog.locator('.connector-form-panel').boundingBox();
    const panelBox = await panel.boundingBox();
    if (viewport.width > 800) expect(panelBox.x).toBeGreaterThanOrEqual(formBox.x + formBox.width);
    else expect(panelBox.y).toBeGreaterThanOrEqual(formBox.y + formBox.height);
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(viewport.width);
    const model = dialog.getByRole('switch', { name: 'sample-chat-small', exact: true });
    await model.focus();
    await page.keyboard.press('Space');
    await expect(model).toHaveAttribute('aria-checked', 'true');
    await page.screenshot({ path: `test-results/model-panel-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add connector', exact: true })).toBeFocused();
  });
}
