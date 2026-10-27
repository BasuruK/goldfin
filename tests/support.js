import { CONNECTORS_PATH } from '../src/lib/connectors/api.js';
import { OCR_PATH } from '../src/lib/ocr/api.js';

/**
 * The element's bounding box; throws when it has none, so a test fails at the lookup.
 * @param {import('@playwright/test').Locator} locator
 */
export async function boxOf(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} has no bounding box`);
  return box;
}

/**
 * Intercepts the Connector API so specs never need a live server. A POST is recorded in
 * `state.posts` and answered 201 with the saved Connector, which then joins the list;
 * `reject` answers it with that status and message instead. `saveDelayMs` holds the POST
 * reply back, for late-reply specs.
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {import('../src/lib/connectors/api.js').SavedConnector[]} [options.saved]
 * @param {{ status: number, message: string }} [options.reject]
 * @param {number} [options.saveDelayMs]
 */
export async function mockConnectorApi(page, options = {}) {
  const state = {
    connectors: [...(options.saved ?? [])],
    /** @type {Record<string, string>[]} */
    posts: []
  };
  await page.route(`**${CONNECTORS_PATH}`, async route => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { connectors: state.connectors } });
    if (request.method() !== 'POST') return route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
    const body = /** @type {Record<string, string>} */ (JSON.parse(request.postData() ?? '{}'));
    state.posts.push(body);
    if (options.saveDelayMs) await new Promise(resolve => setTimeout(resolve, options.saveDelayMs));
    if (options.reject) return route.fulfill({ status: options.reject.status, json: { message: options.reject.message } });
    /** @type {import('../src/lib/connectors/api.js').SavedConnector} */
    const saved = {
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

/**
 * @param {import('@playwright/test').Locator} dialog
 * @param {string} label
 */
export async function selectProvider(dialog, label) {
  await dialog.getByLabel('Provider', { exact: true }).click();
  await dialog.page().getByRole('option', { name: label, exact: true }).click();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {string} [options.content]
 * @param {number} [options.pages]
 * @param {number} [options.delayMs]
 * @param {{ status: number, message: string }} [options.reject]
 */
export async function mockOcrApi(page, options = {}) {
  await page.route(`**${OCR_PATH}`, async route => {
    if (options.delayMs) await new Promise(resolve => setTimeout(resolve, options.delayMs));
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
