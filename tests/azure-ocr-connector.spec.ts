import { expect, test, type Page } from '@playwright/test';
import { mockConnectorApi, selectProvider } from './support.ts';

async function openAzureOcrDraft(page: Page) {
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await selectProvider(dialog, 'Azure Document Intelligence');
  return dialog;
}

test('Azure Document Intelligence save sends apiVersion and lists after reload', async ({ page }) => {
  const api = await mockConnectorApi(page);
  await page.goto('/connectors/');
  const dialog = await openAzureOcrDraft(page);
  await dialog.getByLabel('Name', { exact: true }).fill('EU OCR');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://ocr.example.cognitiveservices.azure.com');
  await dialog.getByLabel('API version', { exact: true }).fill('2024-11-30');
  await dialog.getByLabel('API Key', { exact: true }).fill('test-key');
  await dialog.getByLabel('Credential label', { exact: true }).fill('Fixture key');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(api.posts[0]).toMatchObject({
    name: 'EU OCR',
    providerType: 'azure_document_intelligence',
    baseUrl: 'https://ocr.example.cognitiveservices.azure.com',
    apiVersion: '2024-11-30',
    credential: 'test-key',
    credentialLabel: 'Fixture key'
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'EU OCR', exact: true })).toBeVisible();
});
