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

const llmConnector = {
  id: 'llm-1',
  name: 'Fixture LLM',
  providerType: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  llmApiMode: 'responses',
  credentialLabel: 'Fixture key',
  models: [{ id: 'gpt-test', enabled: true }]
};

const fixturePrompt = {
  id: 'p1',
  name: 'Invoices',
  createdAt: '2026-01-01T00:00:00Z',
  latestVersion: {
    id: 'v3',
    version: 3,
    content: 'Extract the total.',
    createdAt: '2026-01-01T00:00:00Z'
  }
};

function llmSection(page: import('@playwright/test').Page) {
  return page.locator('#playground-llm');
}

async function runOcrThenLlm(page: import('@playwright/test').Page) {
  await page.goto('/playground/');
  await page.locator('input[type="file"]').setInputFiles(blankPdf);
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.locator('.playground-text').first()).toHaveText('Known OCR text', { timeout: 5_000 });
  await llmSection(page).getByRole('button', { name: 'Run', exact: true }).click();
}

test('OCR then LLM shows parsed output, metadata, and Full output without a second LLM request', async ({
  page
}) => {
  await mockConnectorApi(page, { saved: [azureConnector, llmConnector] });
  await mockPromptListApi(page, [fixturePrompt]);
  const llm = await mockLlmApi(page, {
    content: 'Parsed LLM text',
    fullOutput: '{"fixture":"raw-response"}',
    stopped: '',
    promptVersion: fixturePrompt.latestVersion,
    usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 }
  });
  await mockOcrApi(page, { content: 'Known OCR text', pages: 1 });
  await runOcrThenLlm(page);

  const llmPane = llmSection(page).locator('.playground-text');
  await expect(llmPane).toHaveText('Parsed LLM text', { timeout: 5_000 });
  await expect(llmSection(page).getByText('Prompt v3')).toBeVisible();
  await expect(llmSection(page).getByText('Input 12 · Output 4 · Total 16')).toBeVisible();
  expect(llm.getCalls()).toBe(1);

  await llmSection(page).getByRole('switch', { name: 'Full output' }).click();
  await expect(llmPane).toHaveText('{"fixture":"raw-response"}');
  expect(llm.getCalls()).toBe(1);

  await llmSection(page).getByRole('switch', { name: 'Full output' }).click();
  await expect(llmPane).toHaveText('Parsed LLM text');
  expect(llm.getCalls()).toBe(1);
});

test('a cut-off reply shows text with the stopped label; an empty reply shows the inspect hint', async ({
  page
}) => {
  await mockConnectorApi(page, { saved: [azureConnector, llmConnector] });
  await mockPromptListApi(page, []);
  await mockOcrApi(page, { content: 'Known OCR text', pages: 1 });

  await mockLlmApi(page, {
    content: 'Partial value',
    fullOutput: '{}',
    stopped: 'length',
    usage: null
  });
  await runOcrThenLlm(page);
  const llmPane = llmSection(page).locator('.playground-text');
  await expect(llmPane).toHaveText('Partial value', { timeout: 5_000 });
  await expect(llmSection(page).getByText('Stopped early: length')).toBeVisible();
  await expect(llmSection(page).getByText('No prompt')).toBeVisible();

  await page.reload();
  await mockConnectorApi(page, { saved: [azureConnector, llmConnector] });
  await mockPromptListApi(page, []);
  await mockOcrApi(page, { content: 'Known OCR text', pages: 1 });
  await mockLlmApi(page, {
    content: '   ',
    fullOutput: '{"empty":true}',
    stopped: '',
    usage: null
  });
  await runOcrThenLlm(page);
  await expect(llmSection(page).locator('.playground-text')).toHaveText(
    'No text extracted — switch on Full output to inspect the response.',
    { timeout: 5_000 }
  );
});