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

type MockConnectorState = {
  connectors: SavedConnector[];
  posts: Record<string, unknown>[];
  puts: { id: string; body: Record<string, unknown> }[];
  deletes: string[];
};

function textAt(body: Record<string, unknown>, key: string, existing?: string): string {
  const value = body[key];
  return typeof value === 'string' ? value : (existing ?? '');
}

function pickString(body: Record<string, unknown>, key: string, existing?: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value : existing;
}

function pickModels(body: Record<string, unknown>, existing?: SavedConnector['models']) {
  return Array.isArray(body.models) ? (body.models as SavedConnector['models']) : existing;
}

function pickCredentialSetAt(body: Record<string, unknown>, existing?: string) {
  return typeof body.credential === 'string' && body.credential ? new Date().toISOString() : existing;
}

function connectorFromBody(id: string, body: Record<string, unknown>, existing?: SavedConnector): SavedConnector {
  return {
    id,
    name: textAt(body, 'name', existing?.name),
    providerType: textAt(body, 'providerType', existing?.providerType),
    baseUrl: textAt(body, 'baseUrl', existing?.baseUrl),
    apiVersion: pickString(body, 'apiVersion', existing?.apiVersion),
    llmApiMode: pickString(body, 'llmApiMode', existing?.llmApiMode),
    models: pickModels(body, existing?.models),
    credentialLabel: pickString(body, 'credentialLabel', existing?.credentialLabel),
    credentialSetAt: pickCredentialSetAt(body, existing?.credentialSetAt)
  };
}

function connectorItemId(url: string): string | null {
  const match = new URL(url).pathname.match(/\/api\/v1\/connectors\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function fulfillConnectorItem(
  route: Parameters<Page['route']>[1] extends (route: infer R, ...args: never[]) => void ? R : never,
  state: MockConnectorState,
  options: MockConnectorApiOptions,
  id: string,
  method: string
) {
  const index = state.connectors.findIndex(connector => connector.id === id);
  if (method === 'PUT') {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
    state.puts.push({ id, body });
    await mockRouteDelay(options.saveDelayMs);
    if (options.reject) return route.fulfill({ status: options.reject.status, json: { message: options.reject.message } });
    if (index < 0) return route.fulfill({ status: 404, json: { message: 'Connector not found.' } });
    const updated = connectorFromBody(id, body, state.connectors[index]);
    state.connectors = state.connectors.map((connector, i) => (i === index ? updated : connector));
    return route.fulfill({ status: 200, json: updated });
  }
  if (method === 'DELETE') {
    state.deletes.push(id);
    if (index < 0) return route.fulfill({ status: 404, json: { message: 'Connector not found.' } });
    if (options.reject) return route.fulfill({ status: options.reject.status, json: { message: options.reject.message } });
    state.connectors = state.connectors.filter(connector => connector.id !== id);
    return route.fulfill({ status: 204, body: '' });
  }
  return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
}

async function fulfillConnectorCollection(
  route: Parameters<Page['route']>[1] extends (route: infer R, ...args: never[]) => void ? R : never,
  state: MockConnectorState,
  options: MockConnectorApiOptions,
  method: string
) {
  if (method === 'GET') return route.fulfill({ json: { connectors: state.connectors } });
  if (method !== 'POST') return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
  const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
  state.posts.push(body);
  await mockRouteDelay(options.saveDelayMs);
  if (options.reject) return route.fulfill({ status: options.reject.status, json: { message: options.reject.message } });
  const saved = connectorFromBody(`c${state.posts.length}`, body);
  state.connectors = [...state.connectors, saved];
  return route.fulfill({ status: 201, json: saved });
}

/** Intercepts the Connector API so specs never need a live server. */
export async function mockConnectorApi(page: Page, options: MockConnectorApiOptions = {}) {
  const state: MockConnectorState = {
    connectors: [...(options.saved ?? [])],
    posts: [],
    puts: [],
    deletes: []
  };
  await page.route('**/api/v1/connectors**', async route => {
    const method = route.request().method();
    const itemId = connectorItemId(route.request().url());
    if (itemId) return fulfillConnectorItem(route, state, options, itemId, method);
    return fulfillConnectorCollection(route, state, options, method);
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