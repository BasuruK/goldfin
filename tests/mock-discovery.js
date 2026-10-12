/**
 * @param {import('@playwright/test').Page} page
 * @param {string} attemptId
 * @param {Record<string, unknown>} result
 */
export async function mockDiscovery(page, attemptId, result) {
  await page.route('**/api/v1/model-discovery/attempts', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: attemptId, status: 'queued' })
      });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/v1/model-discovery/attempts/${attemptId}`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: attemptId, status: 'finished', result })
    });
  });
}

/**
 * Confirms the model when verification is not the subject of the test.
 * @param {import('@playwright/test').Page} page
 * @param {Record<string, unknown>} result
 */
export async function mockVerification(page, result) {
  await page.route('**/api/v1/model-verification/attempts', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'verify-1', status: 'queued' })
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/v1/model-verification/attempts/verify-1', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'verify-1', status: 'finished', result })
    });
  });
}
