import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockConnectorApi, mockLlmApi, mockOcrApi, mockPromptListApi } from './support.ts';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const blankPdf = path.join(fixtureDir, 'fixtures', 'blank.pdf');

const azureConnector = {
  id: 'ocr-1',
  name: 'Fixture OCR',
  providerType: 'azure_document_intelligence',
  baseUrl: 'https://ocr.example.cognitiveservices.azure.com',
  apiVersion: '2024-11-30',
  credentialLabel: 'Fixture key'
};

const foundryConnector = {
  id: 'foundry-1',
  name: 'Fixture Foundry',
  providerType: 'azure_foundry',
  baseUrl: 'https://foundry.example.services.ai.azure.com',
  credentialLabel: 'Fixture key',
  models: [
    { id: 'mistral-ocr', enabled: true },
    { id: 'other-model', enabled: false }
  ]
};

function ocrControls(page: import('@playwright/test').Page) {
  return page.locator('.playground-controls').first();
}

const llmConnector = {
  id: 'llm-1',
  name: 'Fixture LLM',
  providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  llmApiMode: 'responses',
  credentialLabel: 'Fixture key',
  models: [{ id: 'gpt-test', enabled: true }]
};

test('Foundry OCR shows model select, runs with the first enabled model, and switching to Document Intelligence clears extraction', async ({
  page
}) => {
  let submittedModelId = '';
  await mockConnectorApi(page, { saved: [foundryConnector, azureConnector] });
  await page.route('**/api/v1/probes/ocr', async route => {
    const body = route.request().postData() ?? '';
    const match = body.match(/name="modelId"\r\n\r\n([^\r]+?)\r\n--/);
    submittedModelId = match?.[1] ?? '';
    await route.fulfill({ json: { content: 'Foundry OCR text', pages: 2 } });
  });
  await page.goto('/playground/');
  await expect(ocrControls(page).getByLabel('Model', { exact: true })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles(blankPdf);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.locator('.playground-text')).toHaveText('Foundry OCR text', { timeout: 5_000 });
  expect(submittedModelId).toBe('mistral-ocr');
  await expect(page.getByText('2 pages')).toBeVisible();

  await ocrControls(page).getByLabel('Connector', { exact: true }).click();
  await page.getByRole('option', { name: /Fixture OCR · Azure Document Intelligence/, exact: true }).click();
  await expect(ocrControls(page).getByLabel('Model', { exact: true })).toBeHidden();
  await expect(page.locator('.playground-text')).toHaveText('');
});

test('Analyze shows OCR text and rejects stale replies after Stop', async ({ page }) => {
  await mockConnectorApi(page, { saved: [azureConnector] });
  await mockOcrApi(page, { content: 'Known OCR text', pages: 1, delayMs: 800 });
  await page.goto('/playground/');
  await page.locator('input[type="file"]').setInputFiles(blankPdf);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByText('Running OCR…')).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByText(/Stopped locally/)).toBeVisible();
  await expect(page.locator('.playground-text')).toHaveText('');
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.locator('.playground-text')).toHaveText('Known OCR text', { timeout: 5_000 });
  await expect(page.getByText('Characters')).toBeVisible();
});

test('provider failure shows a mapped message without fabricating text', async ({ page }) => {
  await mockConnectorApi(page, { saved: [azureConnector] });
  await mockOcrApi(page, { reject: { status: 502, message: 'Could not extract the Document.' } });
  await page.goto('/playground/');
  await page.locator('input[type="file"]').setInputFiles(blankPdf);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Goldfin is unavailable right now. Try again.');
  await expect(page.locator('.playground-text')).toHaveText('');
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 720 }]) {
  test(`playground layout at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockConnectorApi(page, { saved: [azureConnector, foundryConnector, llmConnector] });
    await mockPromptListApi(page, []);
    await mockLlmApi(page);
    await page.goto('/playground/');
    if (viewport.width < 768) {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    }
    await page.screenshot({ path: `test-results/playground-${viewport.width}.png`, fullPage: true });
    const link = page.getByRole('link', { name: 'OCR Playground', exact: true });
    await link.focus();
    await expect(link).toBeFocused();
  });
}
