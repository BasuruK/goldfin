/**
 * @param {Record<string, unknown>} body
 * @param {readonly string[]} fields
 */
function assertPostBody(body, fields) {
  if (!body || typeof body !== 'object') return false;
  for (const field of fields) {
    if (!(field in body)) return false;
    const value = body[field];
    if (field === 'apiKey') {
      if (typeof value !== 'string') return false;
      continue;
    }
    if (typeof value !== 'string' || !value.trim()) return false;
  }
  return true;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} attemptsPath
 * @param {string} attemptId
 * @param {Record<string, unknown>} result
 * @param {{ postFields: readonly string[], pollsBeforeFinish?: number }} options
 */
async function mockAttemptFlow(page, attemptsPath, attemptId, result, options) {
  const pollsBeforeFinish = options.pollsBeforeFinish ?? 1;
  let polls = 0;

  await page.route(`**${attemptsPath}`, async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (!assertPostBody(body, options.postFields)) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Invalid request body.' })
        });
        return;
      }
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: attemptId, status: 'queued' })
      });
      return;
    }
    await route.continue();
  });

  await page.route(`**${attemptsPath}/${attemptId}`, async route => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    polls += 1;
    const status = polls < pollsBeforeFinish ? 'queued' : 'finished';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        status === 'finished' ? { id: attemptId, status, result } : { id: attemptId, status }
      )
    });
  });
}

const DISCOVERY_POST_FIELDS = ['connectorId', 'providerType', 'baseUrl', 'apiKey'];
const VERIFICATION_POST_FIELDS = [...DISCOVERY_POST_FIELDS, 'modelId'];

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} attemptId
 * @param {Record<string, unknown>} result
 */
export async function mockDiscovery(page, attemptId, result) {
  await mockAttemptFlow(page, '/api/v1/model-discovery/attempts', attemptId, result, {
    postFields: DISCOVERY_POST_FIELDS,
    pollsBeforeFinish: 2
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} [attemptId]
 * @param {Record<string, unknown>} result
 */
export async function mockVerification(page, result, attemptId = 'verify-1') {
  await mockAttemptFlow(page, '/api/v1/model-verification/attempts', attemptId, result, {
    postFields: VERIFICATION_POST_FIELDS,
    pollsBeforeFinish: 2
  });
}
