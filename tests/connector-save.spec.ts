import { expect, test, type Page } from '@playwright/test';
import { mockConnectorApi, selectProvider } from './support.ts';

const savedConnector = {
  id: 'c9',
  name: 'Gateway',
  providerType: 'web_request',
  baseUrl: 'https://example.com/extract',
  credentialLabel: 'Prod key'
};

async function openWebRequestDraft(page: Page) {
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await selectProvider(dialog, 'Web Request');
  return dialog;
}

test('a successful Save lists the Connector and it survives a reload', async ({ page }) => {
  const api = await mockConnectorApi(page);
  await page.goto('/connectors/');
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://example.com/extract');
  await dialog.getByLabel('API Key', { exact: true }).fill('secret-token');
  await dialog.getByLabel('Credential label', { exact: true }).fill('Prod key');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Gateway is saved.', { exact: true })).toBeVisible();
  expect(api.posts).toEqual([{
    name: 'Gateway',
    providerType: 'web_request',
    baseUrl: 'https://example.com/extract',
    credential: 'secret-token',
    credentialLabel: 'Prod key'
  }]);
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toBeVisible();
  await expect(page.getByText('Prod key', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toBeVisible();
});

test('a rejected Save retains an editable draft, adds no card, and keeps prior Connectors', async ({ page }) => {
  const existing = { id: 'c0', name: 'Existing', providerType: 'web_request', baseUrl: 'https://existing.example' };
  const api = await mockConnectorApi(page, { saved: [existing], reject: { status: 400, message: 'Invalid Connector.' } });
  await page.goto('/connectors/');
  await expect(page.getByRole('heading', { name: 'Existing', exact: true })).toBeVisible();
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://example.com/extract');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Invalid Connector.');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://fixed.example/extract');
  await expect(dialog.getByLabel('Base URL', { exact: true })).toHaveValue('https://fixed.example/extract');
  expect(api.posts).toHaveLength(1);
  expect('credential' in api.posts[0]).toBe(false);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Existing', exact: true })).toBeVisible();
});

test('an unreachable API mid-Save retains the draft and clears the busy state', async ({ page }) => {
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  await page.route('**/api/v1/connectors', route => (route.request().method() === 'POST' ? route.abort() : route.fallback()));
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('Could not reach the API');
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Gateway');
  await expect(save).toBeEnabled();
});

test('a reply that lands after Cancel lists the Connector but leaves a reopened draft alone', async ({ page }) => {
  await mockConnectorApi(page, { saveDelayMs: 1_200 });
  await page.goto('/connectors/');
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const reopened = await openWebRequestDraft(page);
  await reopened.getByLabel('Name', { exact: true }).fill('Second');
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(reopened).toBeVisible();
  await expect(reopened.getByLabel('Name', { exact: true })).toHaveValue('Second');
  await expect(page.getByText(/is saved\./)).toHaveCount(0);
});

test('Cancel discards the draft without saving', async ({ page }) => {
  const api = await mockConnectorApi(page);
  await page.goto('/connectors/');
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Unsaved');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(api.posts).toEqual([]);
  const reopened = await openWebRequestDraft(page);
  await expect(reopened.getByLabel('Name', { exact: true })).toHaveValue('Web Request');
});

test('an unsupported provider cannot be saved but still shows manual model entry', async ({ page }) => {
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Delete connector', exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Saving is not available for OpenAI yet/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('heading', { name: 'Models', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Model ID', { exact: true })).toBeVisible();
});

test('an unreachable API reports and retries', async ({ page }) => {
  await page.route('**/api/v1/connectors', route => route.abort());
  await page.goto('/connectors/');
  await expect(page.getByRole('heading', { name: 'Connectors unavailable', exact: true })).toBeVisible();
  await page.unroute('**/api/v1/connectors');
  await mockConnectorApi(page, { saved: [savedConnector] });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toBeVisible();
});

test('legacy on-device data is cleared on load and never listed', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('goldfin.connectors.v1', JSON.stringify([{
        id: 'legacy', providerType: 'web_request', name: 'Legacy gateway', baseUrl: 'https://example.com', apiKey: 'plaintext', models: []
      }]));
    }
  });
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  await expect(page.getByRole('heading', { name: 'No connectors yet', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Legacy gateway', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('goldfin.connectors.v1'))).toBeNull();
});

test('saved cards expose no Configure or Delete until edit and deletion ship', async ({ page }) => {
  await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Configure', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete connector', exact: true })).toHaveCount(0);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 720 }]) {
  test(`Save dialog fits ${viewport.width}px with keyboard access`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockConnectorApi(page);
    await page.goto('/connectors/');
    const dialog = await openWebRequestDraft(page);
    await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
    const save = dialog.getByRole('button', { name: 'Save', exact: true });
    await save.focus();
    await expect(save).toBeFocused();
    await page.screenshot({ path: `test-results/save-dialog-${viewport.width}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Add connector', exact: true })).toBeFocused();
  });
}
