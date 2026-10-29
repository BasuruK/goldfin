import type { Locator, Page } from '@playwright/test';
import { CONNECTORS_PATH, type SavedConnector } from '../src/lib/connectors/api.ts';
import { OCR_PATH } from '../src/lib/ocr/api.ts';

async function mockRouteDelay(ms: number | undefined): Promise<void> {
  if (ms) await new Promise(resolve => setTimeout(resolve, ms));
}

/** The element's bounding box; throws when it has none, so a test fails at the lookup. */
export async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no bounding box`);
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
    posts: [] as Record<string, string>[]
  };
  await page.route(`**${CONNECTORS_PATH}`, async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { connectors: state.connectors } });
    if (request.method() !== 'POST') return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, string>;
    state.posts.push(body);
    await mockRouteDelay(options.saveDelayMs);
    if (options.reject) return route.fulfill({ status: options.reject.status, json: { message: options.reject.message } });
    const saved: SavedConnector = {
      id: `c${state.posts.length}`,
      name: body.name,
      providerType: body.providerType,
      baseUrl: body.baseUrl
    };
    if (body.apiVersion) saved.apiVersion = body.apiVersion;
    if (body.credentialLabel) saved.credentialLabel = body.credentialLabel;
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
  await page.route(`**${OCR_PATH}`, async route => {
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
