import { CONNECTORS_PATH, SAVE_ATTEMPTS_PATH } from '../src/lib/connectors/save-attempts.js';

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
 * attempt's id; polling any other handle is recorded in `state.unexpectedPolls` and
 * answered 500 (assert it stays empty). When a poll returns a finished attempt with
 * a finding whose `connectorId` equals `savedOnSuccess.id`, that Connector joins
 * the list. `failPollAfter` aborts every poll after that many polls, for
 * transport-failure specs. Unexpected HTTP verbs get a 405.
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
    polls: 0,
    /** @type {string[]} */
    unexpectedPolls: []
  };
  /** @type {import('../src/lib/connectors/save-attempts.js').SaveAttempt[]} */
  const attempts = [...(options.attempts ?? [{ id: 'attempt-1', state: 'finished', finding: { kind: 'reachable', httpStatus: 200, latencyMs: 42 } }])];
  const attemptId = attempts[0].id;

  /**
   * Answers 405 and returns false for any other verb, so each handler states its
   * verb contract once. Throwing inside a handler would leave the request hanging.
   * @param {import('@playwright/test').Route} route
   * @param {string} method
   */
  async function allowMethod(route, method) {
    if (route.request().method() === method) return true;
    await route.fulfill({ status: 405, json: { message: 'Method not allowed.' } });
    return false;
  }

  await page.route(`**${SAVE_ATTEMPTS_PATH}/*`, async route => {
    if (!(await allowMethod(route, 'GET'))) return;
    if (options.pollDelayMs) await new Promise(resolve => setTimeout(resolve, options.pollDelayMs));
    const requestedId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    if (requestedId !== attemptId) {
      state.unexpectedPolls.push(requestedId);
      return route.fulfill({ status: 500, json: { message: `Unexpected attempt handle "${requestedId}".` } });
    }
    state.polls += 1;
    if (options.failPollAfter !== undefined && state.polls > options.failPollAfter) {
      return route.abort();
    }
    // Non-empty by construction: the setup guard rejects an empty `attempts`.
    const next = /** @type {import('../src/lib/connectors/save-attempts.js').SaveAttempt} */ (
      attempts.length > 1 ? attempts.shift() : attempts[0]
    );
    if (next.state === 'finished' && next.finding && options.savedOnSuccess && next.connectorId === options.savedOnSuccess.id) {
      const saved = options.savedOnSuccess;
      if (!state.connectors.some(entry => entry.id === saved.id)) {
        state.connectors = [...state.connectors, saved];
      }
    }
    await route.fulfill({ json: next });
  });
  await page.route(`**${SAVE_ATTEMPTS_PATH}`, async route => {
    if (!(await allowMethod(route, 'POST'))) return;
    try {
      state.posts.push(JSON.parse(route.request().postData() ?? '{}'));
    } catch {
      return route.fulfill({ status: 400, json: { message: 'Expected a JSON body.' } });
    }
    await route.fulfill({ status: 202, json: { id: attemptId, state: 'queued' } });
  });
  await page.route(`**${CONNECTORS_PATH}`, async route => {
    if (!(await allowMethod(route, 'GET'))) return;
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
