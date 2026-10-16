import { expect, test } from '@playwright/test';
import { mockConnectorApi, selectProvider } from './support.js';

const savedConnector = {
  id: 'c1',
  name: 'Gateway',
  providerType: 'web_request',
  baseUrl: 'https://example.com/extract',
  credentialLabel: 'Prod key'
};

/** @param {import('@playwright/test').Page} page */
async function openWebRequestDraft(page) {
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await selectProvider(dialog, 'Web Request');
  return dialog;
}

test('a successful Save polls to Reachable and lists the checked Connector', async ({ page }) => {
  const api = await mockConnectorApi(page, {
    attempts: [
      { id: 'attempt-1', state: 'queued' },
      { id: 'attempt-1', state: 'running' },
      { id: 'attempt-1', state: 'finished', connectorId: 'c1', finding: { kind: 'reachable', httpStatus: 200, latencyMs: 42 } }
    ],
    savedOnSuccess: savedConnector
  });
  await page.goto('/connectors/');
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://example.com/extract');
  await dialog.getByLabel('API Key', { exact: true }).fill('secret-token');
  await dialog.getByLabel('Credential label', { exact: true }).fill('Prod key');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(api.polls).toBe(3);
  await expect(page.getByText(/Reachable \(200, 42ms\)\. Gateway is saved\./)).toBeVisible();
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

test('a failed Save retains an editable draft, adds no card, and keeps prior Connectors', async ({ page }) => {
  const existing = { id: 'c0', name: 'Existing', providerType: 'web_request', baseUrl: 'https://existing.example' };
  const api = await mockConnectorApi(page, {
    saved: [existing],
    attempts: [{ id: 'attempt-1', state: 'finished', failureCode: 'unreachable' }]
  });
  await page.goto('/connectors/');
  await expect(page.getByRole('heading', { name: 'Existing', exact: true })).toBeVisible();
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://example.com/extract');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not reach');
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Gateway');
  // The retained draft can be corrected before a retry.
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://fixed.example/extract');
  await expect(dialog.getByLabel('Base URL', { exact: true })).toHaveValue('https://fixed.example/extract');
  expect(api.posts).toHaveLength(1);
  expect('credential' in api.posts[0]).toBe(false);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Existing', exact: true })).toBeVisible();
});

test('cancelling mid-Save drops the late result', async ({ page }) => {
  await mockConnectorApi(page, {
    attempts: [{ id: 'attempt-1', state: 'finished', connectorId: 'c1', finding: { kind: 'reachable', httpStatus: 200, latencyMs: 42 } }],
    savedOnSuccess: savedConnector,
    pollDelayMs: 1_200
  });
  await page.goto('/connectors/');
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  // Wait past the delayed poll; the superseded reply must not save or notify.
  await page.waitForTimeout(1_800);
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toHaveCount(0);
  await expect(page.getByText(/is saved\./)).toHaveCount(0);
});

test('leaving the page mid-Save disposes the attempt and the draft', async ({ page }) => {
  await mockConnectorApi(page, {
    attempts: [{ id: 'attempt-1', state: 'finished', connectorId: 'c1', finding: { kind: 'reachable', httpStatus: 200, latencyMs: 42 } }],
    pollDelayMs: 1_200
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await page.getByRole('link', { name: 'Connectors', exact: true }).click();
  await expect(page).toHaveURL(/\/connectors\/$/);
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await page.goBack();
  await expect(page).toHaveURL('http://127.0.0.1:5175/');
  await page.goForward();
  await expect(page).toHaveURL(/\/connectors\/$/);
  // The draft and dialog must not resurrect, and the late reply must not notify.
  // (The worker-side Save may still commit; that is the T5 contract, not UI state.)
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(1_800);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(/is saved\./)).toHaveCount(0);
  const fresh = await openWebRequestDraft(page);
  await expect(fresh.getByLabel('Name', { exact: true })).toHaveValue('Web Request');
});

test('reloading mid-Save never renders the attempt as saved', async ({ page }) => {
  await mockConnectorApi(page, {
    attempts: [{ id: 'attempt-1', state: 'running' }],
    savedOnSuccess: savedConnector
  });
  await page.goto('/connectors/');
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByText(/Checking/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toHaveCount(0);
  await expect(page.getByText(/is saved\./)).toHaveCount(0);
});

test('a polling failure mid-Save retains the draft and clears the busy state', async ({ page }) => {
  await mockConnectorApi(page, {
    attempts: [{ id: 'attempt-1', state: 'running' }],
    failPollAfter: 1
  });
  await page.goto('/connectors/');
  const dialog = await openWebRequestDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('Gateway');
  const save = dialog.getByRole('button', { name: 'Save', exact: true });
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('Could not reach the API');
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Gateway');
  await expect(save).toBeEnabled();
});

test('Cancel discards the draft without staging a Save', async ({ page }) => {
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

test('an unsupported provider cannot be saved but keeps the simulated preview', async ({ page }) => {
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Delete connector', exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Saving is not available for OpenAI yet/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Preview models', exact: true }).click();
  await expect(dialog.getByText(/Simulated catalog/)).toBeVisible();
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

test('legacy on-device data needs the explicit reset and is never listed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('goldfin.connectors.v1', JSON.stringify([{
    id: 'legacy', providerType: 'web_request', name: 'Legacy gateway', baseUrl: 'https://example.com', apiKey: 'plaintext', models: []
  }])));
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  await expect(page.getByRole('heading', { name: 'Legacy on-device Connectors', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Legacy gateway', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear legacy data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Legacy on-device Connectors', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('goldfin.connectors.v1'))).toBeNull();
});

test('a failed legacy clear reports instead of pretending success', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('goldfin.connectors.v1', '[]');
    Storage.prototype.removeItem = () => { throw new Error('blocked'); };
  });
  await mockConnectorApi(page);
  await page.goto('/connectors/');
  await expect(page.getByRole('heading', { name: 'Legacy on-device Connectors', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear legacy data', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not clear the legacy data');
  await expect(page.getByRole('heading', { name: 'Legacy on-device Connectors', exact: true })).toBeVisible();
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
