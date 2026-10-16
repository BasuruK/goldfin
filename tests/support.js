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
 * Intercepts the checked-Save API so specs never need a live server. `attempts` are
 * returned in order for successive polls (the last one repeats). When a poll returns
 * a finished attempt with a finding, `savedOnSuccess` joins the Connector list.
 * @param {import('@playwright/test').Page} page
 * @param {{ saved?: unknown[], attempts?: Record<string, unknown>[], savedOnSuccess?: unknown, pollDelayMs?: number }} [options]
 */
export async function mockConnectorApi(page, options = {}) {
  const state = {
    connectors: [...(options.saved ?? [])],
    /** @type {Record<string, unknown>[]} */
    posts: [],
    polls: 0
  };
  const attempts = [...(options.attempts ?? [{ id: 'attempt-1', state: 'finished', finding: { kind: 'reachable', httpStatus: 200, latencyMs: 42 } }])];
  await page.route('**/api/v1/connector-save-attempts/*', async route => {
    if (options.pollDelayMs) await new Promise(resolve => setTimeout(resolve, options.pollDelayMs));
    state.polls += 1;
    const next = attempts.length > 1 ? attempts.shift() : attempts[0];
    if (next?.state === 'finished' && next.finding && options.savedOnSuccess) {
      state.connectors = [options.savedOnSuccess];
    }
    await route.fulfill({ json: next });
  });
  await page.route('**/api/v1/connector-save-attempts', async route => {
    state.posts.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ status: 202, json: { id: 'attempt-1', state: 'queued' } });
  });
  await page.route('**/api/v1/connectors', async route => {
    await route.fulfill({ json: { connectors: state.connectors } });
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
