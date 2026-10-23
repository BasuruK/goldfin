import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const html = await readFile(new URL('./ocr-playground.html', import.meta.url), 'utf8');
const pageURL = 'http://ocr.local/';
const markdownURL = 'https://cdn.jsdelivr.net/npm/markdown-it@15.0.3/dist/browser/markdown-it.umd.min.js';
const markdownResponse = await fetch(markdownURL, { signal: AbortSignal.timeout(15000) });
if (!markdownResponse.ok) throw new Error('Could not load the pinned Markdown renderer for browser tests.');
const markdownSource = await markdownResponse.text();

async function playground(t) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.setDefaultTimeout(5000);
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url === pageURL) return route.fulfill({ contentType: 'text/html', body: html });
    if (url === markdownURL) return route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: markdownSource });
    return route.abort();
  });
  await page.goto(pageURL);
  return page;
}

async function configure(page, region, base, key) {
  await page.getByRole('button', { name: 'Connectors', exact: true }).click();
  await page.getByLabel('Edit connector').selectOption(region);
  await page.getByLabel('Base URL', { exact: true }).fill(base);
  await page.getByLabel('API key', { exact: true }).fill(key);
  await page.getByRole('button', { name: 'Save connector', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Connector saved in this browser.');
}

async function addLLM(page, name, protocol = 'responses') {
  await page.getByRole('button', { name: 'Connectors', exact: true }).click();
  await page.getByLabel('Edit connector').selectOption('new');
  await page.getByLabel('Connector name', { exact: true }).fill(name);
  await page.getByLabel('API mode', { exact: true }).selectOption(protocol);
  await page.getByLabel('Base URL', { exact: true }).fill('https://llm.example.com/v1/');
  await page.getByLabel('API key', { exact: true }).fill('llm-test-key');
  await page.getByLabel('Model ID', { exact: true }).fill('my-model');
  await page.getByRole('button', { name: 'Save connector', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Connector saved in this browser.');
}

async function savePrompt(page, name, content) {
  await page.getByRole('button', { name: 'Prompts', exact: true }).click();
  await page.getByLabel('Saved prompt', { exact: true }).selectOption('new');
  await page.getByLabel('Prompt name', { exact: true }).fill(name);
  await page.getByLabel('Prompt content', { exact: true }).fill(content);
  await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
  await expect(page.locator('#promptMessage')).toContainText('Prompt saved');
}

test('named Prompts save exact Markdown, preview safely and retain edits across navigation and reload', async (t) => {
  const page = await playground(t);
  const content = '# Extract\n\n**Total** and `currency`.\n\n- Keep values\n\n<script>window.promptInjected = true</script>\n[bad](javascript:alert(1))\n';
  await savePrompt(page, 'Invoices', content);
  await page.getByRole('button', { name: 'Markdown preview', exact: true }).click();
  await expect(page.getByLabel('Prompt content', { exact: true })).toBeHidden();
  await expect(page.locator('#promptMarkdown h1')).toHaveText('Extract');
  await expect(page.locator('#promptMarkdown strong')).toHaveText('Total');
  await expect(page.locator('#promptMarkdown code')).toHaveText('currency');
  await expect(page.locator('#promptMarkdown li')).toHaveText('Keep values');
  await expect(page.locator('#promptMarkdown script, #promptMarkdown a[href^="javascript:"]')).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.promptInjected), undefined);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Prompt content', { exact: true })).toHaveValue(content);
  await page.getByLabel('Prompt content', { exact: true }).fill('  Updated instructions.\n');
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await page.getByRole('button', { name: 'Prompts', exact: true }).click();
  await expect(page.getByLabel('Prompt content', { exact: true })).toHaveValue('  Updated instructions.\n');
  await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
  await savePrompt(page, 'Verification', 'Check results.');
  await page.reload();
  await page.getByRole('button', { name: 'Prompts', exact: true }).click();
  await page.getByLabel('Saved prompt', { exact: true }).selectOption({ label: 'Invoices' });
  await expect(page.getByLabel('Prompt content', { exact: true })).toHaveValue('  Updated instructions.\n');
  await page.getByLabel('Saved prompt', { exact: true }).selectOption({ label: 'Verification' });
  await expect(page.getByLabel('Prompt content', { exact: true })).toHaveValue('Check results.');
});

test('Prompt storage failures preserve saved text, and editing survives an unavailable Markdown CDN', async (t) => {
  const page = await playground(t);
  await savePrompt(page, 'Keep', 'Saved instructions.');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'ocr-playground.prompts') throw new Error('Storage full');
      return setItem.call(this, key, value);
    };
  });
  await page.getByLabel('Prompt content', { exact: true }).fill('Unsaved replacement.');
  await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
  await expect(page.locator('#promptMessage')).toContainText('Prompt was not saved');
  await page.route(markdownURL, (route) => route.abort());
  await page.reload();
  await page.getByRole('button', { name: 'Prompts', exact: true }).click();
  await page.getByLabel('Saved prompt', { exact: true }).selectOption({ label: 'Keep' });
  await expect(page.getByLabel('Prompt content', { exact: true })).toHaveValue('Saved instructions.');
  await page.getByRole('button', { name: 'Markdown preview', exact: true }).click();
  await expect(page.locator('#promptMessage')).toContainText('Markdown preview is unavailable');
  await expect(page.getByLabel('Prompt content', { exact: true })).toBeVisible();
  await page.getByLabel('Prompt content', { exact: true }).fill('Editing still works.');
  await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
  await expect(page.locator('#promptMessage')).toContainText('Prompt saved');
  await page.evaluate(() => localStorage.setItem('ocr-playground.prompts', 'broken saved data'));
  await page.reload();
  await page.getByRole('button', { name: 'Prompts', exact: true }).click();
  await expect(page.locator('#promptMessage')).toContainText('Saved prompts could not be loaded');
  await expect(page.getByRole('button', { name: 'Save prompt', exact: true })).toBeDisabled();
  assert.equal(await page.evaluate(() => localStorage.getItem('ocr-playground.prompts')), 'broken saved data');
});

test('Workflow storage failures preserve saved Workflows', async (t) => {
  const page = await playground(t);
  await page.evaluate(() => localStorage.setItem('ocr-playground.workflows', 'broken saved data'));
  await page.reload();
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await expect(page.locator('#workflowMessage')).toContainText('Saved workflows could not be loaded');
  await expect(page.getByRole('button', { name: 'Save workflow', exact: true })).toBeDisabled();
  assert.equal(await page.evaluate(() => localStorage.getItem('ocr-playground.workflows')), 'broken saved data');
});

test('named LLM connectors retain API mode, model and API-root path without replacing OCR settings', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await addLLM(page, 'Extraction', 'responses');
  await addLLM(page, 'Compatible', 'chat');
  await page.reload();
  await page.getByRole('button', { name: 'Connectors', exact: true }).click();
  for (const [name, mode] of [['Extraction', 'responses'], ['Compatible', 'chat']]) {
    await page.getByLabel('Edit connector').selectOption({ label: name });
    await expect(page.getByLabel('Connector name', { exact: true })).toHaveValue(name);
    await expect(page.getByLabel('API mode', { exact: true })).toHaveValue(mode);
    await expect(page.getByLabel('Model ID', { exact: true })).toHaveValue('my-model');
    await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue('https://llm.example.com/v1');
    await expect(page.getByLabel('API key', { exact: true })).toHaveValue('llm-test-key');
  }
  await page.getByLabel('Edit connector').selectOption('eu');
  await expect(page.getByLabel('API key', { exact: true })).toHaveValue('eu-test-key');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await expect(page.getByLabel('Connector', { exact: true }).locator('option')).toHaveCount(3);
});

test('connection test uses unsaved LLM settings in either API mode without saving them', async (t) => {
  const page = await playground(t);
  for (const protocol of ['responses', 'chat']) {
    await addLLM(page, 'Connection ' + protocol, protocol);
    await page.getByLabel('Base URL', { exact: true }).fill('https://draft.example.com/v1');
    await page.getByLabel('API key', { exact: true }).fill('draft-key');
    await page.getByLabel('Model ID', { exact: true }).fill('draft-model');
    let calls = 0;
    await page.route('https://draft.example.com/v1/**', async (route) => {
      calls++;
      const request = route.request();
      assert.equal(request.headers().authorization, 'Bearer draft-key');
      assert.equal(request.postDataJSON().model, 'draft-model');
      if (protocol === 'responses') {
        assert.equal(request.url(), 'https://draft.example.com/v1/responses');
        assert.deepEqual(request.postDataJSON(), { model: 'draft-model', input: 'Reply with OK.', store: false });
        await route.fulfill({ json: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }] } });
      } else {
        assert.equal(request.url(), 'https://draft.example.com/v1/chat/completions');
        await route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content: 'OK' } }] } });
      }
    });
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(page.locator('#connectorMessage')).toContainText('succeeded (HTTP 200)');
    assert.equal(calls, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('ocr-playground.connectors').includes('draft-key')), false);
    await page.getByLabel('Model ID', { exact: true }).fill('changed-again');
    await expect(page.locator('#connectorMessage')).toBeEmpty();
  }
});

test('connection test reports server and network failures without exposing their response bodies', async (t) => {
  const page = await playground(t);
  await addLLM(page, 'Extraction');
  for (const [response, message] of [
    [{ status: 401, body: 'llm-test-key private document' }, 'HTTP 401'],
    [{ json: { error: { message: 'llm-test-key private document' } } }, 'LLM returned an error'],
    [null, 'Network or CORS failure']
  ]) {
    let calls = 0;
    await page.route('https://llm.example.com/v1/responses', (route) => { calls++; return response ? route.fulfill(response) : route.abort(); });
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(page.locator('#connectorMessage')).toContainText(message);
    await expect(page.locator('#connectorMessage')).not.toContainText('llm-test-key');
    await expect(page.locator('#connectorMessage')).not.toContainText('private document');
    await expect(page.getByLabel('API key', { exact: true })).toBeEnabled();
    assert.equal(calls, 1);
  }
});

test('connection test can be cancelled and times out after 30 seconds', async (t) => {
  const page = await playground(t);
  await addLLM(page, 'Extraction');
  await page.clock.install();
  await page.evaluate(() => {
    window.calls = 0;
    window.fetch = (_url, options) => {
      window.calls++;
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));
    };
  });
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await page.waitForFunction(() => window.calls === 1);
  await expect(page.getByLabel('API key', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel test', exact: true }).click();
  await expect(page.locator('#connectorMessage')).toContainText('cancelled');
  await expect(page.getByLabel('API key', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await page.waitForFunction(() => window.calls === 2);
  await page.clock.fastForward(30000);
  await expect(page.locator('#connectorMessage')).toContainText('timed out after 30 seconds');
  await expect(page.getByRole('button', { name: 'Test connection', exact: true })).toBeEnabled();
  await expect(page.getByLabel('API key', { exact: true })).toBeEnabled();
});

test('OCR connection tests require a document and support Foundry and Document Intelligence polling', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(page.locator('#connectorMessage')).toContainText('Select a document');
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await page.route('https://eu.services.ai.azure.com/**', async (route) => {
    assert.equal(route.request().postDataJSON().document.document_url, 'data:application/pdf;base64,JVBERi10ZXN0');
    await route.fulfill({ json: { pages: [{ markdown: 'OCR test text' }] } });
  });
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(page.locator('#connectorMessage')).toContainText('succeeded (HTTP 200)');
  await page.getByLabel('Edit connector').selectOption('di');
  await page.getByLabel('Base URL', { exact: true }).fill('https://di.cognitiveservices.azure.com');
  await page.getByLabel('API key', { exact: true }).fill('di-test-key');
  await page.route('https://di.cognitiveservices.azure.com/**', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 202, headers: { 'Operation-Location': 'https://di.cognitiveservices.azure.com/operations/1', 'Access-Control-Expose-Headers': 'Operation-Location' } })
    : route.fulfill({ json: { status: 'succeeded', analyzeResult: { content: 'OCR test text', pages: [{}] } } }));
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(page.locator('#connectorMessage')).toContainText('polling for completion');
  await expect(page.locator('#connectorMessage')).toContainText('succeeded (HTTP 200)');
  await expect(page.locator('#out')).toBeEmpty();
  await expect(page.locator('#sStatus')).toHaveText('Idle');
});

async function addNode(page, name) {
  await page.getByLabel('Saved connector', { exact: true }).selectOption({ label: name });
  await page.getByRole('button', { name: 'Add node', exact: true }).click();
  return page.getByRole('group', { name: name + ' node', exact: true }).last();
}

async function connectNodes(from, to) {
  await from.getByRole('button', { name: 'Output', exact: true }).click();
  await to.getByRole('button', { name: 'Input', exact: true }).click();
}

test('multiple connector nodes, prompts, positions and lines survive named workflow saves', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await addLLM(page, 'Extraction');
  await savePrompt(page, 'Extract total', 'Extract the total.');
  await savePrompt(page, 'Check total', 'Check that total.');
  await savePrompt(page, 'Updated extraction', 'Updated extraction.');
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  const ocr = await addNode(page, 'Foundry EU');
  const header = ocr.getByRole('button', { name: 'Move node', exact: true });
  const before = await header.boundingBox();
  await page.mouse.move(before.x + 40, before.y + 15);
  await page.mouse.down();
  await page.mouse.move(before.x + 70, before.y + 55, { steps: 8 });
  await page.mouse.up();
  const moved = await header.boundingBox();
  assert.ok(moved.x > before.x + 20 && moved.y > before.y + 30);
  const first = await addNode(page, 'Extraction');
  await first.getByLabel('Prompt', { exact: true }).selectOption({ label: 'Extract total' });
  const second = await addNode(page, 'Extraction');
  await second.getByLabel('Prompt', { exact: true }).selectOption({ label: 'Check total' });
  // Re-select after adding the second node; both use the same saved connector.
  const llms = page.getByRole('group', { name: 'Extraction node', exact: true });
  await connectNodes(ocr, llms.nth(0));
  await connectNodes(llms.nth(0), llms.nth(1));
  await connectNodes(llms.nth(1), page.getByRole('group', { name: 'Preview node', exact: true }));
  await page.getByLabel('Workflow name', { exact: true }).fill('Invoices');
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await expect(page.locator('#workflowMessage')).toContainText('Workflow saved');
  await page.getByRole('group', { name: 'Extraction node', exact: true }).nth(0).getByLabel('Prompt', { exact: true }).selectOption({ label: 'Updated extraction' });
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await page.getByLabel('Saved workflow', { exact: true }).selectOption({ label: 'Invoices' });
  await expect(page.locator('.workflow-node')).toHaveCount(4);
  await expect(page.locator('.workflow-wire')).toHaveCount(3);
  await expect(page.getByRole('group', { name: 'Extraction node', exact: true }).nth(0).getByLabel('Prompt', { exact: true }).locator('option:checked')).toHaveText('Updated extraction');
  await expect(page.getByRole('group', { name: 'Extraction node', exact: true }).nth(1).getByLabel('Prompt', { exact: true }).locator('option:checked')).toHaveText('Check total');
  const restored = await page.getByRole('group', { name: 'Foundry EU node', exact: true }).getByRole('button', { name: 'Move node', exact: true }).boundingBox();
  assert.ok(Math.abs(restored.x - moved.x) <= 1 && Math.abs(restored.y - moved.y) <= 1);
  await page.getByLabel('Saved workflow', { exact: true }).selectOption('new');
  await expect(page.locator('.workflow-node')).toHaveCount(1);
  await page.getByLabel('Workflow name', { exact: true }).fill('Another workflow');
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await page.getByLabel('Saved workflow', { exact: true }).selectOption({ label: 'Invoices' });
  await expect(page.locator('.workflow-node')).toHaveCount(4);
});

test('workflow reports missing documents on its own page', async (t) => {
  const page = await playground(t);
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(page.locator('#workflowMessage')).toContainText('No document selected');
});

test('ports support line dragging, reject cycles, disconnect inputs and remove attached lines', async (t) => {
  const page = await playground(t);
  await page.setViewportSize({ width: 1600, height: 1100 });
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await addLLM(page, 'First');
  await addLLM(page, 'Second');
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  const ocr = await addNode(page, 'Foundry EU');
  const first = await addNode(page, 'First');
  const second = await addNode(page, 'Second');
  const start = await ocr.getByRole('button', { name: 'Output', exact: true }).boundingBox();
  const end = await second.getByRole('button', { name: 'Input', exact: true }).boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.workflow-wire')).toHaveCount(1);
  await connectNodes(second, first);
  await connectNodes(first, second);
  await expect(page.locator('#workflowMessage')).toContainText('cannot contain cycles');
  await page.keyboard.press('Escape');
  await expect(page.locator('.workflow-wire')).toHaveCount(2);
  await second.getByRole('button', { name: 'Input', exact: true }).click();
  await expect(page.locator('.workflow-wire')).toHaveCount(1);
  await second.getByRole('button', { name: 'Remove node', exact: true }).click();
  await expect(page.locator('.workflow-wire')).toHaveCount(0);
});

async function runnableWorkflow(t) {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await addLLM(page, 'Extraction');
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  const ocr = await addNode(page, 'Foundry EU');
  const llm = await addNode(page, 'Extraction');
  await connectNodes(ocr, llm);
  await connectNodes(llm, page.getByRole('group', { name: 'Preview node', exact: true }));
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await page.route('https://eu.services.ai.azure.com/**', (route) => route.fulfill({ json: { pages: [{ markdown: 'Invoice' }] } }));
  return page;
}

test('old inline Prompts still execute, and missing saved Prompts block all requests until replaced', async (t) => {
  const page = await runnableWorkflow(t);
  await page.getByLabel('Workflow name', { exact: true }).fill('Legacy');
  await page.getByRole('button', { name: 'Save workflow', exact: true }).click();
  await page.evaluate(() => {
    const workflows = JSON.parse(localStorage.getItem('ocr-playground.workflows'));
    const node = workflows[0].nodes.find((node) => node.kind === 'llm');
    node.prompt = '  Existing instructions.\n';
    delete node.promptId;
    localStorage.setItem('ocr-playground.workflows', JSON.stringify(workflows));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await page.getByLabel('Saved workflow', { exact: true }).selectOption({ label: 'Legacy' });
  await expect(page.getByRole('group', { name: 'Extraction node', exact: true }).getByLabel('Prompt', { exact: true }).locator('option:checked')).toHaveText('Existing inline prompt');
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  let calls = 0;
  let expectedInstructions = '  Existing instructions.\n';
  await page.route('https://llm.example.com/v1/responses', (route) => {
    calls++;
    const expected = { model: 'my-model', input: 'Invoice', store: false };
    if (expectedInstructions) expected.instructions = expectedInstructions;
    assert.deepEqual(route.request().postDataJSON(), expected);
    return route.fulfill({ json: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Result' }] }] } });
  });
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(page.locator('#workflowOutput')).toHaveText('Result');
  const inlinePrompt = page.getByRole('group', { name: 'Extraction node', exact: true }).getByLabel('Prompt', { exact: true });
  await inlinePrompt.selectOption('');
  await expect(inlinePrompt.getByRole('option', { name: 'Existing inline prompt', exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    const workflows = JSON.parse(localStorage.getItem('ocr-playground.workflows'));
    workflows[0].nodes.find((node) => node.kind === 'llm').promptId = 'prompt-missing';
    localStorage.setItem('ocr-playground.workflows', JSON.stringify(workflows));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await page.getByLabel('Saved workflow', { exact: true }).selectOption({ label: 'Legacy' });
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  let ocrCalls = 0;
  await page.route('https://eu.services.ai.azure.com/**', (route) => { ocrCalls++; return route.fulfill({ json: { pages: [{ markdown: 'Invoice' }] } }); });
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(page.locator('#workflowMessage')).toContainText('saved prompt is missing');
  assert.equal(ocrCalls, 0);
  assert.equal(calls, 1);
  const dropdown = page.getByRole('group', { name: 'Extraction node', exact: true }).getByLabel('Prompt', { exact: true });
  await expect(dropdown.locator('option:checked')).toHaveText('Missing saved prompt');
  await dropdown.selectOption({ label: 'No system instructions' });
  expectedInstructions = '';
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(page.locator('#workflowOutput')).toHaveText('Result');
  assert.equal(calls, 2);
});

test('workflow response preview shows the Playground effect while running, resizes, and clears on completion or Stop', async (t) => {
  const page = await runnableWorkflow(t);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let finish;
  await page.route('https://llm.example.com/v1/responses', async (route) => {
    await new Promise((resolve) => { finish = resolve; });
    await route.fulfill({ json: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Finished' }] }] } });
  });
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  const preview = page.getByLabel('LLM response preview', { exact: true });
  const effect = preview.locator('canvas');
  await expect(effect).toBeVisible();
  await expect(preview).toContainText('Extraction');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#workflowPreview canvas');
    return canvas && canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0);
  });
  const frame = await effect.evaluate((canvas) => canvas.toDataURL());
  await page.waitForFunction((frame) => document.querySelector('#workflowPreview canvas').toDataURL() !== frame, frame);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => effect.evaluate((canvas) => Math.abs(canvas.width / Math.min(devicePixelRatio, 2) - canvas.clientWidth))).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `/tmp/goldfin-ocr-workflow-loading-${width}.png`, fullPage: true });
  }
  finish();
  await expect(page.locator('#workflowOutput')).toHaveText('Finished');
  await expect(effect).toBeHidden();
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(effect).toBeVisible();
  await page.getByRole('button', { name: 'Stop workflow', exact: true }).click();
  await expect(effect).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(effect).toBeVisible();
  await expect(preview).toContainText('Extraction');
  assert.equal(await effect.evaluate((canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)), false);
  await page.getByRole('button', { name: 'Stop workflow', exact: true }).click();
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByLabel('Connector', { exact: true }).selectOption('eu');
  await page.route('https://eu.services.ai.azure.com/**', () => {});
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.locator('#outwrap canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#outwrap canvas')).toBeHidden();
});

test('LLM failures never preview partial output or retry the request', async (t) => {
  const page = await runnableWorkflow(t);
  const failures = [
    [{ json: { status: 'incomplete', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Partial' }] }] } }, 'incomplete'],
    [{ json: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No' }] }] } }, 'no text response'],
    [{ status: 401, body: 'llm-test-key private document' }, 'HTTP 401']
  ];
  for (const [response, message] of failures) {
    let calls = 0;
    await page.route('https://llm.example.com/v1/responses', (route) => { calls++; return route.fulfill(response); });
    await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
    await expect(page.locator('#workflowMessage')).toContainText(message);
    await expect(page.locator('#console')).toContainText(message);
    await expect(page.locator('#workflowOutput')).toBeEmpty();
    await expect(page.getByLabel('LLM response preview', { exact: true }).locator('canvas')).toBeHidden();
    await expect(page.locator('#console')).not.toContainText('llm-test-key');
    assert.equal(calls, 1);
  }
});

test('stopping an LLM ignores its late response while a new workflow can complete', async (t) => {
  const page = await runnableWorkflow(t);
  await page.evaluate(() => {
    const nativeFetch = window.fetch;
    window.fetch = (url, options) => String(url).endsWith('/responses')
      ? new Promise((resolve) => { window.finishOldLLM = () => resolve(new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Stale' }] }] }))); })
      : nativeFetch(url, options);
    window.nativeFetch = nativeFetch;
  });
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await page.waitForFunction(() => window.finishOldLLM);
  await expect(page.getByLabel('Saved workflow', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Prompts', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop workflow', exact: true }).click();
  await expect(page.locator('#workflowMessage')).toContainText('Stopped');
  await expect(page.getByRole('group', { name: 'Extraction node', exact: true }).locator('.node-state')).toHaveText('Stopped');
  await page.evaluate(() => { window.fetch = window.nativeFetch; });
  await page.route('https://llm.example.com/v1/responses', (route) => route.fulfill({ json: { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Fresh response' }] }] } }));
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(page.locator('#workflowOutput')).toHaveText('Fresh response');
  await page.evaluate(() => window.finishOldLLM());
  await expect(page.locator('#workflowOutput')).toHaveText('Fresh response');
});

test('workflow sends OCR text through Responses and Chat Completions and previews only the final path', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await configure(page, 'us', 'https://us.services.ai.azure.com', 'us-test-key');
  await addLLM(page, 'Extraction', 'responses');
  await addLLM(page, 'Verification', 'chat');
  await savePrompt(page, 'Extract', '  # Extract total.\n\nKeep **format**.\n');
  await savePrompt(page, 'Verify', 'Check total.');
  let expectedInstructions = '  # Extract total.\n\nKeep **format**.\n';
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  const ocr = await addNode(page, 'Foundry EU');
  const responses = await addNode(page, 'Extraction');
  await responses.getByLabel('Prompt', { exact: true }).selectOption({ label: 'Extract' });
  const chat = await addNode(page, 'Verification');
  await chat.getByLabel('Prompt', { exact: true }).selectOption({ label: 'Verify' });
  await addNode(page, 'Foundry US');
  await connectNodes(ocr, responses);
  await connectNodes(responses, chat);
  await connectNodes(chat, page.getByRole('group', { name: 'Preview node', exact: true }));
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  const calls = [];
  await page.route('https://eu.services.ai.azure.com/**', async (route) => {
    calls.push('ocr');
    await route.fulfill({ json: { pages: [{ markdown: '# Invoice\nTotal 42' }] } });
  });
  await page.route('https://us.services.ai.azure.com/**', () => { assert.fail('Unconnected OCR node must not run'); });
  await page.route('https://llm.example.com/v1/**', async (route) => {
    const request = route.request();
    assert.equal(request.headers().authorization, 'Bearer llm-test-key');
    assert.equal(request.method(), 'POST');
    if (request.url().endsWith('/responses')) {
      calls.push('responses');
      assert.deepEqual(request.postDataJSON(), { model: 'my-model', input: '# Invoice\nTotal 42', instructions: expectedInstructions, store: false });
      await route.fulfill({ json: { status: 'completed', output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', role: 'assistant', channel: 'commentary', content: [{ type: 'output_text', text: 'Working on it' }] },
        { type: 'message', role: 'assistant', channel: 'final', content: [{ type: 'output_text', text: 'Total: 42' }] }
      ] } });
    } else {
      calls.push('chat');
      assert.equal(request.url(), 'https://llm.example.com/v1/chat/completions');
      assert.deepEqual(request.postDataJSON(), { model: 'my-model', messages: [{ role: 'system', content: 'Check total.' }, { role: 'user', content: 'Total: 42' }] });
      await route.fulfill({ json: { choices: [{ finish_reason: 'stop', message: { content: 'Verified 42' } }] } });
    }
  });
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(page.locator('#workflowOutput')).toHaveText('Verified 42');
  await expect(page.locator('#workflowMessage')).toContainText('Succeeded');
  assert.deepEqual(calls, ['ocr', 'responses', 'chat']);
  await page.getByRole('button', { name: 'Prompts', exact: true }).click();
  await page.getByLabel('Saved prompt', { exact: true }).selectOption({ label: 'Extract' });
  await page.getByLabel('Prompt content', { exact: true }).fill('Updated extraction.\n');
  await page.getByRole('button', { name: 'Save prompt', exact: true }).click();
  expectedInstructions = 'Updated extraction.\n';
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  await expect(page.locator('#workflowOutput')).toBeEmpty();
  await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
  await expect(page.locator('#workflowOutput')).toHaveText('Verified 42');
  assert.deepEqual(calls, ['ocr', 'responses', 'chat', 'ocr', 'responses', 'chat']);
});

test('saves independent EU/US connectors across reload and sends the selected Foundry contract', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com/', 'eu-test-key');
  await configure(page, 'us', 'https://us.services.ai.azure.com', 'us-test-key');
  await page.reload();
  for (const region of ['eu', 'us']) {
    await page.getByRole('button', { name: 'Playground', exact: true }).click();
    await page.getByLabel('Connector', { exact: true }).selectOption(region);
    await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
    let calls = 0;
    await page.route(`https://${region}.services.ai.azure.com/**`, async (route) => {
      calls++;
      const request = route.request();
      assert.equal(request.url(), `https://${region}.services.ai.azure.com/providers/mistral/azure/ocr`);
      assert.equal(request.method(), 'POST');
      assert.equal(request.headers().authorization, `Bearer ${region}-test-key`);
      assert.equal(request.headers()['content-type'], 'application/json');
      assert.deepEqual(request.postDataJSON(), {
        model: 'ocr3-pilot',
        document: { type: 'document_url', document_url: 'data:application/pdf;base64,JVBERi10ZXN0' },
        include_image_base64: false
      });
      await route.fulfill({ json: { pages: [{ markdown: '# Invoice' }, { markdown: 'Total: 42' }], usage_info: { pages_processed: 2 } } });
    });
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.locator('#sStatus')).toHaveText('Succeeded');
    await expect(page.locator('#out')).toHaveText('# Invoice\n\nTotal: 42');
    await expect(page.locator('#sPages')).toHaveText('2');
    assert.equal(calls, 1);
  }
});

test('JPEG and PNG use image data URLs in workflows, Playground and connector tests', async (t) => {
  const page = await runnableWorkflow(t);
  await configure(page, 'us', 'https://us.services.ai.azure.com', 'us-test-key');
  await page.route('https://llm.example.com/v1/responses', (route) => route.fulfill({ json: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Parsed image' }] }] } }));
  const cases = [
    { name: 'scan.JPEG', mime: '', bytes: [255, 216, 255, 217], base64: '/9j/2Q==', type: 'image/jpeg', region: 'eu', mode: 'workflow' },
    { name: 'scan.png', mime: 'application/octet-stream', bytes: [137, 80, 78, 71, 13, 10, 26, 10], base64: 'iVBORw0KGgo=', type: 'image/png', region: 'us', mode: 'playground' },
    { name: 'scan.jpg', mime: 'image/jpeg', bytes: [255, 216, 255, 217], base64: '/9j/2Q==', type: 'image/jpeg', region: 'eu', mode: 'test' }
  ];
  for (const file of cases) {
    let calls = 0;
    await page.route(`https://${file.region}.services.ai.azure.com/**`, (route) => {
      calls++;
      assert.deepEqual(route.request().postDataJSON(), { model: 'ocr3-pilot', document: { type: 'image_url', image_url: `data:${file.type};base64,${file.base64}` }, include_image_base64: false });
      return route.fulfill({ json: { pages: [{ markdown: 'Image OCR' }] } });
    });
    if (file.mode === 'playground') {
      await page.getByRole('button', { name: 'Playground', exact: true }).click();
      await page.getByLabel('Connector', { exact: true }).selectOption(file.region);
      await page.evaluate((file) => {
        const files = new DataTransfer();
        files.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.mime }));
        document.getElementById('drop').dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: files }));
      }, file);
    } else await page.locator('#file').setInputFiles({ name: file.name, mimeType: file.mime, buffer: Buffer.from(file.bytes) });
    if (file.mode === 'workflow') {
      await page.getByRole('button', { name: 'Workflows', exact: true }).click();
      await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
      await expect(page.locator('#workflowOutput')).toHaveText('Parsed image');
    } else if (file.mode === 'test') {
      await page.getByRole('button', { name: 'Connectors', exact: true }).click();
      await page.getByLabel('Edit connector').selectOption(file.region);
      await page.getByRole('button', { name: 'Test connection', exact: true }).click();
      await expect(page.locator('#connectorMessage')).toContainText('succeeded (HTTP 200)');
    } else {
      await page.getByRole('button', { name: 'Analyze', exact: true }).click();
      await expect(page.locator('#out')).toHaveText('Image OCR');
    }
    assert.equal(calls, 1);
  }
});

test('Document Intelligence submits PDF, JPEG, PNG and DOCX bytes with their MIME types and polls with its own key', async (t) => {
  const page = await playground(t);
  await configure(page, 'di', 'https://di.cognitiveservices.azure.com', 'di-test-key');
  await addLLM(page, 'Extraction');
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  const ocr = await addNode(page, 'Document Intelligence');
  const llm = await addNode(page, 'Extraction');
  await connectNodes(ocr, llm);
  await connectNodes(llm, page.getByRole('group', { name: 'Preview node', exact: true }));
  await page.route('https://llm.example.com/v1/responses', (route) => {
    assert.equal(route.request().postDataJSON().input, 'Original OCR');
    return route.fulfill({ json: { output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Parsed DOCX' }] }] } });
  });
  await page.clock.install();
  const files = [
    { name: 'invoice.pdf', mime: 'application/pdf', bytes: '%PDF-test' },
    { name: 'invoice.jpeg', mime: 'image/jpeg', bytes: 'jpeg-test' },
    { name: 'invoice.png', mime: 'image/png', bytes: 'png-test' },
    { name: 'invoice.DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: 'PK-docx-test' }
  ];
  for (const file of files) {
    const methods = [];
    await page.route('https://di.cognitiveservices.azure.com/**', async (route) => {
      const request = route.request();
      methods.push(request.method());
      assert.equal(request.headers()['ocp-apim-subscription-key'], 'di-test-key');
      assert.equal(request.headers().authorization, undefined);
      if (request.method() === 'POST') {
        assert.equal(request.url(), 'https://di.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30');
        assert.equal(request.headers()['content-type'], file.mime);
        assert.equal(request.postData(), file.bytes);
        await route.fulfill({ status: 202, headers: {
          'Operation-Location': 'https://di.cognitiveservices.azure.com/operations/1',
          'Access-Control-Expose-Headers': 'Operation-Location'
        } });
      } else await route.fulfill({ json: { status: 'succeeded', analyzeResult: { content: 'Original OCR', pages: [{}] } } });
    });
    const docx = file.name.endsWith('.DOCX');
    await page.getByRole('button', { name: docx ? 'Workflows' : 'Playground', exact: true }).click();
    if (!docx) await page.getByLabel('Connector', { exact: true }).selectOption('di');
    await page.locator('#file').setInputFiles({ name: file.name, mimeType: '', buffer: Buffer.from(file.bytes) });
    await page.getByRole('button', { name: docx ? 'Run workflow' : 'Analyze', exact: true }).click();
    await expect(page.locator('#sHint')).toContainText('Polling every 2s');
    await page.clock.runFor(2000);
    await expect(page.locator('#sStatus')).toHaveText('Succeeded');
    await expect(page.locator(docx ? '#workflowOutput' : '#out')).toHaveText(docx ? 'Parsed DOCX' : 'Original OCR');
    assert.deepEqual(methods, ['POST', 'GET']);
  }
});

test('Foundry rejects DOCX and every OCR entry point rejects unsupported or empty files before requests', async (t) => {
  const page = await runnableWorkflow(t);
  let calls = 0;
  await page.route('https://eu.services.ai.azure.com/**', (route) => { calls++; return route.abort(); });
  const cases = [
    ['invoice.docx', 'PK-test', 'DOCX requires Document Intelligence'],
    ['invoice.xlsx', 'PK-test', 'Select a non-empty PDF, JPEG, PNG, or DOCX'],
    ['invoice.constructor', 'test', 'Select a non-empty PDF, JPEG, PNG, or DOCX'],
    ['empty.png', '', 'Select a non-empty PDF, JPEG, PNG, or DOCX']
  ];
  for (const [name, content, message] of cases) {
    await page.locator('#file').setInputFiles({ name, mimeType: '', buffer: Buffer.from(content) });
    await page.getByRole('button', { name: 'Workflows', exact: true }).click();
    await page.getByRole('button', { name: 'Run workflow', exact: true }).click();
    await expect(page.locator('#workflowMessage')).toContainText(message);
    await page.getByRole('button', { name: 'Playground', exact: true }).click();
    await page.getByLabel('Connector', { exact: true }).selectOption('eu');
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.locator('#console')).toContainText(message);
    await page.getByRole('button', { name: 'Connectors', exact: true }).click();
    await page.getByLabel('Edit connector').selectOption('eu');
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(page.locator('#connectorMessage')).toContainText(message);
  }
  assert.equal(calls, 0);
});

test('HTTP, malformed JSON, malformed shape, and network failures remain visible without leaking payloads', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByLabel('Connector', { exact: true }).selectOption('eu');
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  const failures = [
    [{ status: 401, body: 'eu-test-key document bytes' }, 'HTTP 401'],
    [{ status: 200, body: '{broken' }, 'invalid JSON'],
    [{ json: { pages: [{ text: 'wrong shape' }] } }, 'missing pages[].markdown'],
    [null, 'Network or CORS failure']
  ];
  for (const [response, message] of failures) {
    await page.route('https://eu.services.ai.azure.com/**', (route) => response ? route.fulfill(response) : route.abort());
    await page.getByRole('button', { name: 'Analyze', exact: true }).click();
    await expect(page.locator('#sStatus')).toHaveText('Failed');
    await expect(page.locator('#console')).toContainText(message);
    await expect(page.locator('#console')).not.toContainText('eu-test-key');
    await expect(page.locator('#console')).not.toContainText('document bytes');
    await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeEnabled();
  }
});

test('Stop ignores a late response and a subsequent request can complete', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByLabel('Connector', { exact: true }).selectOption('eu');
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await page.evaluate(() => {
    window.fetch = () => new Promise((resolve) => { window.finishOldRequest = () => resolve(new Response(JSON.stringify({ pages: [{ markdown: 'Stale' }] }))); });
  });
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.waitForFunction(() => window.finishOldRequest);
  await expect(page.getByLabel('Connector', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#sStatus')).toHaveText('Stopped');
  await page.evaluate(() => { window.fetch = async () => new Response(JSON.stringify({ pages: [{ markdown: 'Fresh' }] })); });
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.locator('#out')).toHaveText('Fresh');
  await page.evaluate(() => window.finishOldRequest());
  await expect(page.locator('#out')).toHaveText('Fresh');
  await expect(page.locator('#sStatus')).toHaveText('Succeeded');
});

test('rejects unsafe URLs and reports storage failures without claiming a save', async (t) => {
  const page = await playground(t);
  await page.getByRole('button', { name: 'Connectors', exact: true }).click();
  await page.getByLabel('Base URL', { exact: true }).fill('https://user:password@example.com/path?key=secret');
  await page.getByRole('button', { name: 'Save connector', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('without a path, query, or credentials');
  await page.getByLabel('Base URL', { exact: true }).fill('https://di.cognitiveservices.azure.com');
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage denied'); }; });
  await page.getByRole('button', { name: 'Save connector', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Browser storage is unavailable. Connector was not saved.');
});

test('times out a stalled request and rejects an oversized Foundry PDF before sending', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByLabel('Connector', { exact: true }).selectOption('eu');
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await page.clock.install();
  await page.evaluate(() => {
    window.calls = 0;
    window.fetch = (_url, options) => {
      window.calls++;
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)));
    };
  });
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.waitForFunction(() => window.calls === 1);
  await page.clock.fastForward(300000);
  await expect(page.locator('#sStatus')).toHaveText('Failed');
  await expect(page.locator('#console')).toContainText('Timed out after 5 minutes');
  await page.locator('#file').setInputFiles({ name: 'large.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(30000001) });
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.locator('#console')).toContainText('Foundry PDFs must be 30 MB or smaller');
  assert.equal(await page.evaluate(() => window.calls), 1);
});

test('Document Intelligence timeout interrupts a long Retry-After wait', async (t) => {
  const page = await playground(t);
  await configure(page, 'di', 'https://di.cognitiveservices.azure.com', 'di-test-key');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.locator('#file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-test') });
  await page.clock.install();
  await page.evaluate(() => {
    window.fetch = async (_url, options) => options.method === 'POST'
      ? new Response(null, { status: 202, headers: { 'Operation-Location': 'https://di.cognitiveservices.azure.com/operations/1' } })
      : new Response(JSON.stringify({ status: 'running' }), { headers: { 'Retry-After': '600' } });
  });
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.locator('#sStatus')).toHaveText('Running');
  await page.clock.runFor(2000);
  await page.clock.fastForward(298000);
  await expect(page.locator('#sStatus')).toHaveText('Failed');
  await expect(page.locator('#console')).toContainText('Timed out after 5 minutes');
});

test('response divider resizes by pointer and keyboard, Preview stays compact, and dots fill the workspace', async (t) => {
  const page = await playground(t);
  await page.setViewportSize({ width: 1800, height: 1200 });
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  const divider = page.getByRole('separator', { name: 'Resize response pane', exact: true });
  const workspace = page.getByLabel('Scrollable workflow workspace', { exact: true });
  const before = await workspace.boundingBox();
  const handle = await divider.boundingBox();
  assert.ok(handle, 'A visible divider must separate the two panes');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 40);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 120, handle.y + 40, { steps: 8 });
  await page.mouse.up();
  const dragged = await workspace.boundingBox();
  assert.ok(before.width - dragged.width > 100, 'Dragging left must give the response pane more room');
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  const keyed = await workspace.boundingBox();
  assert.ok(dragged.width - keyed.width > 40, 'Arrow keys must also resize the panes');
  const preview = await page.getByRole('group', { name: 'Preview node', exact: true }).boundingBox();
  assert.ok(preview.width < 180 && preview.height <= 48, 'Preview must be a small pill');
  const radius = await page.getByRole('group', { name: 'Preview node', exact: true }).evaluate((el) => parseFloat(getComputedStyle(el).borderRadius));
  assert.ok(radius >= preview.height / 2);
  await page.setViewportSize({ width: 1600, height: 1200 });
  await divider.focus();
  await page.keyboard.press('Home');
  assert.ok(Number(await divider.getAttribute('aria-valuenow')) >= Number(await divider.getAttribute('aria-valuemin')));
  await page.keyboard.press('End');
  assert.ok(Number(await divider.getAttribute('aria-valuenow')) <= Number(await divider.getAttribute('aria-valuemax')));
  for (const width of [1800, 1280, 375]) {
    await page.setViewportSize({ width, height: 1200 });
    const bounds = await workspace.boundingBox();
    const canvas = await page.locator('#workflowCanvas').boundingBox();
    assert.ok(canvas.width >= bounds.width - 1 && canvas.height >= bounds.height - 1, 'Dots must cover the full workspace');
    const gap = await page.locator('#workflowCanvas').evaluate((el) => parseFloat(getComputedStyle(el).backgroundSize));
    assert.ok(gap < 24, 'Dots must be denser than the original 24px grid');
  }
  await expect(divider).toBeHidden();
});

test('all prototype pages fit mobile and desktop, and workflows survive narrow, zoomed and RTL layouts', async (t) => {
  const page = await playground(t);
  await configure(page, 'eu', 'https://eu.services.ai.azure.com', 'eu-test-key');
  await addLLM(page, 'Extraction');
  await page.getByRole('button', { name: 'Workflows', exact: true }).click();
  const ocr = await addNode(page, 'Foundry EU');
  const llm = await addNode(page, 'Extraction');
  await connectNodes(ocr, llm);
  await connectNodes(llm, page.getByRole('group', { name: 'Preview node', exact: true }));
  await savePrompt(page, 'Invoice instructions', '# Extract invoice\n\nReturn **total** and `currency`.\n\n- Preserve source values\n\n| Field | Format |\n| --- | --- |\n| total | decimal |');
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['Playground', 'Connectors', 'Workflows', 'Prompts']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${view} overflow at ${width}px`);
      if (view === 'Prompts') {
        if (await page.getByRole('button', { name: 'Edit', exact: true }).count()) await page.getByRole('button', { name: 'Edit', exact: true }).click();
        await expect(page.getByLabel('Prompt content', { exact: true })).toBeVisible();
        await page.screenshot({ path: `/tmp/goldfin-ocr-prompts-edit-${width}.png`, fullPage: true });
        await page.getByRole('button', { name: 'Markdown preview', exact: true }).click();
      }
      await page.screenshot({ path: `/tmp/goldfin-ocr-${view.toLowerCase()}-${width}.png`, fullPage: true });
    }
  }
  for (const settings of [{ width: 320, zoom: '1', dir: 'ltr' }, { width: 1280, zoom: '2', dir: 'ltr' }, { width: 1280, zoom: '1', dir: 'rtl' }]) {
    await page.setViewportSize({ width: settings.width, height: 900 });
    await page.evaluate(({ zoom, dir }) => { document.body.style.zoom = zoom; document.documentElement.dir = dir; }, settings);
    for (const view of ['Workflows', 'Prompts']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${view} overflow: ${JSON.stringify(settings)}`);
    }
  }
});
