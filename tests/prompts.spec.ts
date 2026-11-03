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

/** Serves list, create and append from in-memory Prompts; returns every write it received. */
async function mockPromptApi(page: Page, saved: Prompt[] = []) {
  const prompts = structuredClone(saved);
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
    target.latestVersion = promptVersion((target.latestVersion?.version ?? 0) + 1, body.content);
    return route.fulfill({ status: 201, json: target });
  });
  return writes;
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
