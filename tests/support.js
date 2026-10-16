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
 * returned in order for successive polls (the last one repeats), all under the first
 * attempt's id; polling any other handle gets a 404. When a poll returns a finished
 * attempt with a finding, `savedOnSuccess` joins the Connector list. `failPollAfter`
 * aborts every poll after that many polls, for transport-failure specs.
 * @param {import('@playwright/test').Page} page
 * @param {object} [options]
 * @param {import('../src/lib/connectors/save-attempts.js').SavedConnector[]} [options.saved]
 * @param {import('../src/lib/connectors/save-attempts.js').SaveAttempt[]} [options.attempts]
 * @param {import('../src/lib/connectors/save-attempts.js').SavedConnector} [options.savedOnSuccess]
 * @param {number} [options.pollDelayMs]
 * @param {number} [options.failPollAfter]
 */
export async function mockConnectorApi(page, options = {}) {
  if (options.attempts && options.attempts.length === 0) {
    throw new Error('mockConnectorApi: attempts must not be empty');
  }
  const state = {
    connectors: [...(options.saved ?? [])],
    /** @type {Record<string, unknown>[]} */
    posts: [],
    polls: 0
  };
  /** @type {import('../src/lib/connectors/save-attempts.js').SaveAttempt[]} */
  const attempts = [...(options.attempts ?? [{ id: 'attempt-1', state: 'finished', finding: { kind: 'reachable', httpStatus: 200, latencyMs: 42 } }])];
  const attemptId = attempts[0].id;
  await page.route('**/api/v1/connector-save-attempts/*', async route => {
    if (options.pollDelayMs) await new Promise(resolve => setTimeout(resolve, options.pollDelayMs));
    state.polls += 1;
    if (options.failPollAfter !== undefined && state.polls > options.failPollAfter) {
      return route.abort();
    }
    const requestedId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    if (requestedId !== attemptId) {
      return route.fulfill({ status: 404, json: { message: 'Save attempt not found.' } });
    }
    const next = attempts.length > 1 ? attempts.shift() : attempts[0];
    if (next?.state === 'finished' && next.finding && options.savedOnSuccess) {
      const saved = options.savedOnSuccess;
      if (!state.connectors.some(entry => entry.id === saved.id)) {
        state.connectors = [...state.connectors, saved];
      }
    }
    await route.fulfill({ json: next });
  });
  await page.route('**/api/v1/connector-save-attempts', async route => {
    state.posts.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ status: 202, json: { id: attemptId, state: 'queued' } });
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
