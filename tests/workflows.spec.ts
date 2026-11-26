import { expect, test, type Page, type Request } from '@playwright/test';

interface WfNode {
  id: string;
  name: string;
  connectorId: string;
  modelId?: string;
  promptId?: string;
  inputNodeIds: string[];
}

interface Workflow {
  id: string;
  name: string;
  nodes: WfNode[];
  createdAt: string;
  updatedAt: string;
}

const CREATED = '2026-01-01T00:00:00Z';

const connectors = [
  {
    id: 'ocr',
    name: 'Azure OCR',
    providerType: 'azure_document_intelligence',
    baseUrl: 'https://ocr.example.cognitiveservices.azure.com',
    credentialLabel: 'key'
  },
  {
    id: 'llm',
    name: 'OpenAI',
    providerType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    llmApiMode: 'responses',
    models: [{ id: 'gpt-4o', enabled: true }],
    credentialLabel: 'key'
  }
];

const prompts = [{ id: 'p1', name: 'Extract', createdAt: CREATED, latestVersion: { id: 'v1', version: 1, content: 'body', createdAt: CREATED } }];

async function mockWorkflowFixtures(page: Page) {
  const workflows: Workflow[] = [];
  const writes: { method: string; path: string; body: unknown }[] = [];

  await page.route('**/api/v1/connectors', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { connectors } });
    return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
  });
  await page.route('**/api/v1/prompts', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { prompts } });
    return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
  });

  const record = (request: Request) => {
    let body: unknown = null;
    const postData = request.postData();
    if (postData) {
      try {
        body = JSON.parse(postData) as unknown;
      } catch {
        body = null;
      }
    }
    writes.push({ method: request.method(), path: new URL(request.url()).pathname, body });
    return body;
  };

  await page.route('**/api/v1/workflows', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { workflows } });
    if (request.method() === 'POST') {
      const body = record(request) as { name: string; nodes: WfNode[] };
      const wf: Workflow = {
        id: `w${workflows.length + 1}`,
        name: body.name,
        nodes: body.nodes,
        createdAt: CREATED,
        updatedAt: CREATED
      };
      workflows.push(wf);
      return route.fulfill({ status: 201, json: wf });
    }
    return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
  });

  await page.route('**/api/v1/workflows/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const segments = path.split('/').filter(Boolean);
    const id = segments[2] ?? '';
    const wf = workflows.find(item => item.id === id);
    if (path.endsWith('/probe')) {
      record(request);
      return route.fulfill({
        json: {
          workflowId: id,
          nodes: [
            {
              nodeId: 'n-ocr',
              nodeName: 'OCR',
              kind: 'ocr',
              status: 'completed',
              text: 'Known OCR text',
              durationMs: 10
            },
            {
              nodeId: 'n-llm',
              nodeName: 'Extract',
              kind: 'llm',
              status: 'completed',
              text: 'Parsed LLM text',
              promptVersion: 1,
              durationMs: 20
            }
          ]
        }
      });
    }
    if (request.method() === 'GET') {
      if (!wf) return route.fulfill({ status: 404, json: { message: 'Workflow not found.' } });
      return route.fulfill({ json: wf });
    }
    if (request.method() === 'PUT') {
      if (!wf) return route.fulfill({ status: 404, json: { message: 'Workflow not found.' } });
      const body = record(request) as { name: string; nodes: WfNode[] };
      wf.name = body.name;
      wf.nodes = body.nodes;
      return route.fulfill({ json: wf });
    }
    if (request.method() === 'DELETE') {
      if (!wf) return route.fulfill({ status: 404, json: { message: 'Workflow not found.' } });
      workflows.splice(workflows.indexOf(wf), 1);
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
  });

  return { workflows, writes };
}

async function startDraft(page: Page) {
  await page.goto('/workflows/');
  await page.locator('.workflows-toolbar').getByRole('button', { name: 'New workflow', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workflow name' }).fill('Invoices');
}

async function addOcrNode(page: Page) {
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  await page.getByLabel('Connector', { exact: true }).first().click();
  await page.getByRole('option', { name: 'Azure OCR', exact: true }).click();
  await page.getByLabel('Node name', { exact: true }).first().fill('OCR');
}

async function addLlmNode(page: Page, extraInput?: string) {
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  const card = page.locator('.wf-node').last();
  await card.getByLabel('Node name', { exact: true }).fill('Extract');
  await card.getByLabel('Connector', { exact: true }).click();
  await page.getByRole('option', { name: 'OpenAI', exact: true }).click();
  await card.getByLabel('Model', { exact: true }).click();
  await page.getByRole('option', { name: 'gpt-4o', exact: true }).click();
  await card.getByLabel('Prompt', { exact: true }).click();
  await page.getByRole('option', { name: 'Extract', exact: true }).click();
  await card.getByRole('checkbox', { name: 'OCR', exact: true }).check();
  if (extraInput) {
    await card.getByRole('checkbox', { name: extraInput, exact: true }).check();
  }
}

test('creates and saves a linear Workflow', async ({ page }) => {
  const { writes } = await mockWorkflowFixtures(page);
  await startDraft(page);
  await addOcrNode(page);
  await addLlmNode(page);
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await expect(page.getByText('Invoices is saved.', { exact: true })).toBeVisible();
  expect(writes.some(entry => entry.method === 'POST' && entry.path === '/api/v1/workflows')).toBe(true);
});

test('reorders fan-in inputs with move up and move down', async ({ page }) => {
  await mockWorkflowFixtures(page);
  await startDraft(page);
  await addOcrNode(page);
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  const second = page.locator('.wf-node').nth(1);
  await second.getByLabel('Node name', { exact: true }).fill('Summary');
  await second.getByLabel('Connector', { exact: true }).click();
  await page.getByRole('option', { name: 'OpenAI', exact: true }).click();
  await second.getByLabel('Model', { exact: true }).click();
  await page.getByRole('option', { name: 'gpt-4o', exact: true }).click();
  await second.getByLabel('Prompt', { exact: true }).click();
  await page.getByRole('option', { name: 'Extract', exact: true }).click();
  await second.getByRole('checkbox', { name: 'OCR', exact: true }).check();
  await addLlmNode(page, 'Summary');
  const llm = page.locator('.wf-node').last();
  await expect(llm.getByRole('button', { name: /Move Summary up in input order/i })).toBeVisible();
  await llm.getByRole('button', { name: /Move Summary up in input order/i }).click();
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await expect(page.getByText('Invoices is saved.', { exact: true })).toBeVisible();
});

test('shows a cycle validation error before save', async ({ page }) => {
  const { writes } = await mockWorkflowFixtures(page);
  await startDraft(page);
  await addOcrNode(page);
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  const b = page.locator('.wf-node').nth(1);
  await b.getByLabel('Node name', { exact: true }).fill('B');
  await b.getByLabel('Connector', { exact: true }).click();
  await page.getByRole('option', { name: 'OpenAI', exact: true }).click();
  await b.getByLabel('Model', { exact: true }).click();
  await page.getByRole('option', { name: 'gpt-4o', exact: true }).click();
  await b.getByLabel('Prompt', { exact: true }).click();
  await page.getByRole('option', { name: 'Extract', exact: true }).click();
  await b.getByRole('checkbox', { name: 'OCR', exact: true }).check();

  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  const c = page.locator('.wf-node').nth(2);
  await c.getByLabel('Node name', { exact: true }).fill('C');
  await c.getByLabel('Connector', { exact: true }).click();
  await page.getByRole('option', { name: 'OpenAI', exact: true }).click();
  await c.getByLabel('Model', { exact: true }).click();
  await page.getByRole('option', { name: 'gpt-4o', exact: true }).click();
  await c.getByLabel('Prompt', { exact: true }).click();
  await page.getByRole('option', { name: 'Extract', exact: true }).click();
  await c.getByRole('checkbox', { name: 'B', exact: true }).check();

  await b.getByRole('checkbox', { name: 'C', exact: true }).check();

  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/cycle/i);
  expect(writes.filter(entry => entry.method === 'POST')).toHaveLength(0);
});

test('runs a Workflow Probe and renders node outputs', async ({ page }) => {
  await mockWorkflowFixtures(page);
  await startDraft(page);
  await addOcrNode(page);
  await addLlmNode(page);
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await page.getByLabel('Document', { exact: true }).setInputFiles({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4')
  });
  await page.getByRole('button', { name: 'Run main LLM test case', exact: true }).click();
  await expect(page.getByText('Test case complete.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Known OCR text')).toBeVisible();
  await expect(page.getByText('Parsed LLM text')).toBeVisible();
  await expect(page.getByText('Prompt v1')).toBeVisible();
});

test('shows stopReason on an incomplete LLM node', async ({ page }) => {
  await mockWorkflowFixtures(page);
  await page.route('**/api/v1/workflows/**/probe', async route => {
    await route.fulfill({
      json: {
        workflowId: 'w1',
        nodes: [
          {
            nodeId: 'n-ocr',
            nodeName: 'OCR',
            kind: 'ocr',
            status: 'completed',
            text: 'text',
            durationMs: 1
          },
          {
            nodeId: 'n-llm',
            nodeName: 'Extract',
            kind: 'llm',
            status: 'incomplete',
            stopReason: 'max_tokens',
            text: 'partial',
            promptVersion: 2,
            durationMs: 2
          }
        ]
      }
    });
  });
  await startDraft(page);
  await addOcrNode(page);
  await addLlmNode(page);
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await page.getByLabel('Document', { exact: true }).setInputFiles({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4')
  });
  await page.getByRole('button', { name: 'Run main LLM test case', exact: true }).click();
  await expect(page.getByText('max_tokens')).toBeVisible();
  await expect(page.getByText('partial')).toBeVisible();
  await expect(page.getByText('Prompt v2')).toBeVisible();
});

test('shows fail-fast error output without fabricated text', async ({ page }) => {
  await mockWorkflowFixtures(page);
  await page.route('**/api/v1/workflows/**/probe', async route => {
    await route.fulfill({
      json: {
        workflowId: 'w1',
        nodes: [
          {
            nodeId: 'n-ocr',
            nodeName: 'OCR',
            kind: 'ocr',
            status: 'failed',
            error: 'OCR failed.',
            durationMs: 3
          }
        ]
      }
    });
  });
  await startDraft(page);
  await addOcrNode(page);
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await page.getByLabel('Document', { exact: true }).setInputFiles({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4')
  });
  await page.getByRole('button', { name: 'Run main LLM test case', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'OCR failed.' })).toBeVisible();
  await expect(page.getByText('Parsed LLM text')).toHaveCount(0);
});

test('deletes a saved Workflow after confirmation', async ({ page }) => {
  const { workflows } = await mockWorkflowFixtures(page);
  workflows.push({
    id: 'w1',
    name: 'Legacy',
    createdAt: CREATED,
    updatedAt: CREATED,
    nodes: [{ id: 'n1', name: 'OCR', connectorId: 'ocr', inputNodeIds: [] }]
  });
  await page.goto('/workflows/');
  await page.getByLabel('Saved workflow', { exact: true }).click();
  await page.getByRole('option', { name: 'Legacy', exact: true }).click();
  await page.getByRole('button', { name: 'Delete workflow', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.reload();
  await expect(page.locator('.workflows-toolbar').getByLabel('Saved workflow', { exact: true })).toContainText(
    'New workflow'
  );
});