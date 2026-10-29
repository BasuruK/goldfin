import { expect, test } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockConnectorApi, mockOcrApi } from './support.js';

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
    await mockConnectorApi(page, { saved: [azureConnector] });
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
