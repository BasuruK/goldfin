import { expect, test, type Page } from '@playwright/test';
import { mockConnectorApi, selectProvider } from './support.ts';

const savedConnector = {
  id: 'c9',
  name: 'Gateway',
  providerType: 'web_request',
  baseUrl: 'https://example.com/extract',
  credentialLabel: 'Prod key',
  credentialSetAt: '2026-01-01T00:00:00.000Z'
};

const llmConnector = {
  id: 'c-llm',
  name: 'OpenAI',
  providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  llmApiMode: 'responses',
  credentialLabel: 'Prod',
  credentialSetAt: '2026-01-01T00:00:00.000Z',
  models: [
    { id: 'gpt-4o-mini', enabled: true },
    { id: 'gpt-4o', enabled: false }
  ]
};

function connectorCard(page: Page, name: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('heading', { name, exact: true }) });
}

test('editing a Connector without changing the Credential keeps the label and omits the key', async ({ page }) => {
  const api = await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await connectorCard(page, 'Gateway').getByRole('button', { name: 'Edit Gateway', exact: true }).click();
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
  await connectorCard(page, 'Gateway').getByRole('button', { name: 'Edit Gateway', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('API Key', { exact: true }).fill('rotated-secret');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(api.puts[0]?.body).toMatchObject({
    credential: 'rotated-secret',
    credentialLabel: 'Prod key'
  });
});

test('Provider select is disabled when editing a Connector', async ({ page }) => {
  await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await connectorCard(page, 'Gateway').getByRole('button', { name: 'Edit Gateway', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Provider', { exact: true })).toBeDisabled();
});

test('renaming the Credential label while editing keeps the input mounted', async ({ page }) => {
  const api = await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await connectorCard(page, 'Gateway').getByRole('button', { name: 'Edit Gateway', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const label = dialog.getByLabel('Credential label', { exact: true });
  await label.fill('Renamed label');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(api.puts[0]?.body).toMatchObject({ credentialLabel: 'Renamed label' });
});

test('editing an LLM Connector can change enabled models', async ({ page }) => {
  const api = await mockConnectorApi(page, { saved: [llmConnector] });
  await page.goto('/connectors/');
  await connectorCard(page, 'OpenAI').getByRole('button', { name: 'Edit OpenAI', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('switch', { name: 'gpt-4o', exact: true }).check();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(api.puts[0]?.body).toMatchObject({
    models: [
      { id: 'gpt-4o-mini', enabled: true },
      { id: 'gpt-4o', enabled: true }
    ]
  });
});

test('cancel after edit resets before opening Add connector', async ({ page }) => {
  await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await connectorCard(page, 'Gateway').getByRole('button', { name: 'Edit Gateway', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Should not stick');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Name', { exact: true })).not.toHaveValue('Should not stick');
  await selectProvider(page.getByRole('dialog'), 'Web Request');
});

test('deleting an unused Connector asks for confirmation and removes the card', async ({ page }) => {
  const api = await mockConnectorApi(page, { saved: [savedConnector] });
  await page.goto('/connectors/');
  await connectorCard(page, 'Gateway').getByRole('button', { name: 'Delete', exact: true }).click();
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
  await connectorCard(page, 'Gateway').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Cannot delete Connector because it is used by Workflow: Invoices');
  await expect(page.getByRole('heading', { name: 'Gateway', exact: true })).toBeVisible();
});