import { expect, test, type Page, type Request } from '@playwright/test';

interface PromptVersion {
  id: string;
  version: number;
  content: string;
  createdAt: string;
}

interface Prompt {
  id: string;
  name: string;
  createdAt: string;
  latestVersion?: PromptVersion;
}

const CREATED_AT = '2026-01-01T00:00:00Z';

const invoices: Prompt = {
  id: 'p1',
  name: 'Invoices',
  createdAt: CREATED_AT,
  latestVersion: { id: 'v3', version: 3, content: 'Extract the total.', createdAt: CREATED_AT }
};

function promptVersion(version: number, content: string): PromptVersion {
  return { id: `v${version}`, version, content, createdAt: CREATED_AT };
}

/** Serves list, create, rename and append from in-memory Prompts; returns every write it received. */
async function mockPromptApi(page: Page, saved: Prompt[] = [], options: { failFirstAppend?: boolean } = {}) {
  const prompts = structuredClone(saved);
  let failAppend = options.failFirstAppend === true;
  const writes: { method: string; path: string; body: unknown }[] = [];
  const record = (request: Request) => {
    const body = JSON.parse(request.postData() ?? 'null') as { name?: string; content: string };
    writes.push({ method: request.method(), path: new URL(request.url()).pathname, body });
    return body;
  };
  await page.route('**/api/v1/prompts', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { prompts } });
    const body = record(route.request());
    const prompt: Prompt = {
      id: `p${prompts.length + 1}`,
      name: body.name ?? '',
      createdAt: CREATED_AT,
      latestVersion: promptVersion(1, body.content)
    };
    prompts.push(prompt);
    return route.fulfill({ status: 201, json: prompt });
  });
  await page.route('**/api/v1/prompts/*/versions', async route => {
    const body = record(route.request());
    const target = prompts.find(p => route.request().url().endsWith(`/${p.id}/versions`));
    if (!target) return route.fulfill({ status: 404, json: { message: 'Prompt not found.' } });
    if (failAppend) {
      failAppend = false;
      return route.fulfill({ status: 503, json: { message: 'Could not save the Prompt.' } });
    }
    target.latestVersion = promptVersion((target.latestVersion?.version ?? 0) + 1, body.content);
    return route.fulfill({ status: 201, json: target });
  });
  await page.route('**/api/v1/prompts/*', async route => {
    const body = record(route.request());
    const target = prompts.find(p => route.request().url().endsWith(`/${p.id}`));
    if (!target) return route.fulfill({ status: 404, json: { message: 'Prompt not found.' } });
    target.name = body.name ?? target.name;
    return route.fulfill({ json: target });
  });
  return writes;
}

async function selectSaved(page: Page, label: string) {
  await page.getByLabel('Saved prompt').click();
  await page.getByRole('option', { name: label }).click();
}

function status(page: Page) {
  return page.locator('.prompt-form').getByRole('status');
}

test('saving a new Prompt reports the version it created', async ({ page }) => {
  const writes = await mockPromptApi(page);
  await page.goto('/prompts/');
  await page.getByLabel('Prompt name').fill('Invoices');
  await page.getByLabel('System instructions').fill('Extract the total.');
  await page.getByRole('button', { name: 'Save prompt' }).click();

  await expect(status(page)).toHaveText('Prompt saved as version 1.');
  expect(writes).toEqual([
    { method: 'POST', path: '/api/v1/prompts', body: { name: 'Invoices', content: 'Extract the total.' } }
  ]);
});

test('selecting a saved Prompt loads its latest version', async ({ page }) => {
  await mockPromptApi(page, [invoices]);
  await page.goto('/prompts/');
  await page.getByLabel('Saved prompt').click();
  await page.getByRole('option', { name: 'Invoices' }).click();

  await expect(page.getByLabel('Prompt name')).toHaveValue('Invoices');
  await expect(page.getByLabel('System instructions')).toHaveValue('Extract the total.');
  await expect(status(page)).toHaveText('Version 3 loaded. Edit and save to append a new version.');
});

test('saving an edit to a saved Prompt reports the version it appended', async ({ page }) => {
  const writes = await mockPromptApi(page, [invoices]);
  await page.goto('/prompts/');
  await page.getByLabel('Saved prompt').click();
  await page.getByRole('option', { name: 'Invoices' }).click();
  await page.getByLabel('System instructions').fill('Extract the total and the date.');
  await page.getByRole('button', { name: 'Save prompt' }).click();

  await expect(status(page)).toHaveText('Prompt saved as version 4.');
  await expect(page.getByLabel('System instructions')).toHaveValue('Extract the total and the date.');
  expect(writes).toEqual([
    { method: 'POST', path: '/api/v1/prompts/p1/versions', body: { content: 'Extract the total and the date.' } }
  ]);
});

test('renaming a saved Prompt reports the rename, not a new version', async ({ page }) => {
  const writes = await mockPromptApi(page, [invoices]);
  await page.goto('/prompts/');
  await selectSaved(page, 'Invoices');
  await page.getByLabel('Prompt name').fill('Receipts');
  await page.getByRole('button', { name: 'Save prompt' }).click();

  await expect(status(page)).toHaveText('Prompt renamed.');
  await expect(page.getByLabel('Saved prompt')).toHaveText('Receipts');
  expect(writes).toEqual([{ method: 'PATCH', path: '/api/v1/prompts/p1', body: { name: 'Receipts' } }]);
});

test('a rename that succeeds before a failed append keeps the new name, and the retry only appends', async ({ page }) => {
  const writes = await mockPromptApi(page, [invoices], { failFirstAppend: true });
  await page.goto('/prompts/');
  await selectSaved(page, 'Invoices');
  await page.getByLabel('Prompt name').fill('Receipts');
  await page.getByLabel('System instructions').fill('Extract the total and the date.');
  await page.getByRole('button', { name: 'Save prompt' }).click();

  await expect(page.getByRole('alert')).toHaveText('Goldfin is unavailable right now. Try again.');
  await expect(page.getByLabel('Saved prompt')).toHaveText('Receipts');

  await page.getByRole('button', { name: 'Save prompt' }).click();
  await expect(status(page)).toHaveText('Prompt saved as version 4.');
  expect(writes.map(w => `${w.method} ${w.path}`)).toEqual([
    'PATCH /api/v1/prompts/p1',
    'POST /api/v1/prompts/p1/versions',
    'POST /api/v1/prompts/p1/versions'
  ]);
});

test('choosing New prompt after a saved one clears the draft', async ({ page }) => {
  await mockPromptApi(page, [invoices]);
  await page.goto('/prompts/');
  await selectSaved(page, 'Invoices');
  await selectSaved(page, 'New prompt…');

  await expect(page.getByLabel('Prompt name')).toHaveValue('');
  await expect(page.getByLabel('System instructions')).toHaveValue('');
  await expect(status(page)).toHaveText('New Prompt. Enter a name and system instructions.');
});
