import type { Locator, Page } from '@playwright/test';
import type { SavedConnector } from '../src/lib/connectors/api.ts';

async function mockRouteDelay(ms: number | undefined): Promise<void> {
  if (ms) await new Promise(resolve => setTimeout(resolve, ms));
}

/** The element's bounding box; throws when it has none, so a test fails at the lookup. */
export async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator.toString()} has no bounding box`);
  return box;
}

interface MockConnectorApiOptions {
  saved?: SavedConnector[];
  reject?: { status: number; message: string };
  saveDelayMs?: number;
}

/** Intercepts the Connector API so specs never need a live server. */
export async function mockConnectorApi(page: Page, options: MockConnectorApiOptions = {}) {
  const state = {
    connectors: [...(options.saved ?? [])],
    posts: [] as Record<string, unknown>[]
  };
  await page.route('**/api/v1/connectors', async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { connectors: state.connectors } });
    if (request.method() !== 'POST') return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    state.posts.push(body);
    await mockRouteDelay(options.saveDelayMs);
    if (options.reject) return route.fulfill({ status: options.reject.status, json: { message: options.reject.message } });
    const saved: SavedConnector = {
      id: `c${state.posts.length}`,
      name: String(body.name),
      providerType: String(body.providerType),
      baseUrl: String(body.baseUrl)
    };
    if (typeof body.apiVersion === 'string') saved.apiVersion = body.apiVersion;
    if (typeof body.credentialLabel === 'string') saved.credentialLabel = body.credentialLabel;
    state.connectors = [...state.connectors, saved];
    await route.fulfill({ status: 201, json: saved });
  });
  return state;
}

export async function selectProvider(dialog: Locator, label: string) {
  await dialog.getByLabel('Provider', { exact: true }).click();
  await dialog.page().getByRole('option', { name: label, exact: true }).click();
}

interface MockOcrApiOptions {
  content?: string;
  pages?: number;
  delayMs?: number;
  reject?: { status: number; message: string };
}

export async function mockOcrApi(page: Page, options: MockOcrApiOptions = {}) {
  await page.route('**/api/v1/probes/ocr', async route => {
    await mockRouteDelay(options.delayMs);
    if (options.reject) {
      return route.fulfill({ status: options.reject.status, json: { message: options.reject.message } });
    }
    try {
      await route.fulfill({
        json: { content: options.content ?? 'Known OCR text', pages: options.pages ?? 1 }
      });
    } catch {
      // Client aborted (e.g. Stop) after delayMs; nothing left to fulfil.
    }
  });
}

interface MockPromptListEntry {
  id: string;
  name: string;
  createdAt: string;
  latestVersion?: {
    id: string;
    version: number;
    content: string;
    createdAt: string;
  };
}

interface MockLlmApiOptions {
  content?: string;
  fullOutput?: string;
  stopped?: string;
  promptVersion?: MockPromptListEntry['latestVersion'] | null;
  usage?: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
  delayMs?: number;
  reject?: { status: number; message: string };
}

/** Lists saved Prompts for playground and probe specs. */
export async function mockPromptListApi(page: Page, saved: MockPromptListEntry[] = []) {
  await page.route('**/api/v1/prompts', async route => {
    if (route.request().method() !== 'GET') return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
    await route.fulfill({ json: { prompts: saved } });
  });
}

/** Intercepts the LLM Probe route; returns a call counter. */
export async function mockLlmApi(page: Page, options: MockLlmApiOptions = {}) {
  let calls = 0;
  await page.route('**/api/v1/probes/llm', async route => {
    calls += 1;
    await mockRouteDelay(options.delayMs);
    if (options.reject) {
      return route.fulfill({ status: options.reject.status, json: { message: options.reject.message } });
    }
    try {
      await route.fulfill({
        json: {
          content: options.content ?? 'Parsed LLM text',
          fullOutput: options.fullOutput ?? '{"parsed":true,"raw":"fixture"}',
          stopped: options.stopped ?? '',
          promptVersion: options.promptVersion === undefined ? null : options.promptVersion,
          usage:
            options.usage === undefined
              ? { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
              : options.usage
        }
      });
    } catch {
      // Client aborted while delayed; nothing left to fulfil.
    }
  });
  return { getCalls: () => calls };
}
