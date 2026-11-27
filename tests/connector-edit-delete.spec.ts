import { expect, test } from '@playwright/test';
import { mockConnectorApi } from './support.ts';

const savedConnector = {
  id: 'c9',
  name: 'Gateway',
  providerType: 'web_request',
  baseUrl: 'https://example.com/extract',
  credentialLabel: 'Prod key',
  credentialSetAt: '2026-01-01T00:00:00.000Z'
};

test('editing a Connector without changing the Credential keeps the label and omits the key', async ({ page }) => {
  const api = await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Edit Gateway', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Renamed gateway');
  await dialog.getByLabel('Base URL', { exact: true }).fill('https://renamed.example/extract');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Renamed gateway is updated.', { exact: true })).toBeVisible();
  expect(api.puts).toEqual([
    {
      id: 'c9',
      body: {
        name: 'Renamed gateway',
        providerType: 'web_request',
        baseUrl: 'https://renamed.example/extract',
        credentialLabel: 'Prod key'
      }
    }
  ]);
  await expect(page.getByRole('heading', { name: 'Renamed gateway', exact: true })).toBeVisible();
});

test('rotating a Credential on edit sends the new key', async ({ page }) => {
  const api = await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Edit Gateway', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('API Key', { exact: true }).fill('rotated-secret');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(api.puts[0]?.body).toMatchObject({
    credential: 'rotated-secret',
    credentialLabel: 'Prod key'
  });
});

test('deleting an unused Connector asks for confirmation and removes the card', async ({ page }) => {
  const api = await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Delete Gateway', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Gateway is deleted.', { exact: true })).toBeVisible();
  expect(api.deletes).toEqual(['c9']);
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toHaveCount(0);
});

test('a Workflow-in-use delete keeps the card and surfaces the error', async ({ page }) => {
  await mockConnectorApi(page, {
    saved: [savedConnector],
    reject: {
      status: 409,
      message: 'Cannot delete Connector because it is used by Workflow: Invoices'
    }
  });
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Delete Gateway', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot delete Connector because it is used by Workflow: Invoices');
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toBeVisible();
});