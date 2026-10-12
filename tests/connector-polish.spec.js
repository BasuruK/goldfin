import { expect, test } from '@playwright/test';
import { mockDiscovery, mockVerification } from './mock-discovery.js';

test('Integrations opens and closes through intermediate sizes and keyboard activation is instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const group = page.getByRole('button', { name: 'Integrations', exact: true });
  await expect(group).toBeVisible();
  const frames = await page.evaluate(async () => {
    const trigger = document.querySelector('[title="Integrations"]');
    const reveal = document.querySelector('#integrations-links').closest('.nav-reveal');
    const readFrames = async () => {
      const sizes = [];
      for (let frame = 0; frame < 24; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        sizes.push(reveal.getBoundingClientRect().height);
      }
      return sizes;
    };
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    const opening = await readFrames();
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    const closing = await readFrames();
    return { opening, closing };
  });
  const fullHeight = frames.opening.at(-1);
  expect(fullHeight).toBeGreaterThan(0);
  expect(frames.opening.some(height => height > 0 && height < fullHeight)).toBe(true);
  expect(frames.closing.some(height => height > 0 && height < fullHeight)).toBe(true);
  expect(frames.closing.at(-1)).toBe(0);
  await group.focus();
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.nav-reveal').last()).toHaveCSS('transition-duration', '0s');
});

test('menu items never shrink while pressed', async ({ page }) => {
  await page.goto('/connectors/');
  for (const item of [page.getByRole('link', { name: 'Connectors', exact: true }), page.getByRole('button', { name: 'Integrations', exact: true })]) {
    await item.hover();
    await page.mouse.down();
    await expect(item).toHaveCSS('transform', 'none');
    await page.mouse.up();
  }
});

test('Delete is hidden in Add and appears when configuring an added Connector', async ({ page }) => {
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Add connector', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Delete connector', exact: true })).toHaveCount(0);
  await dialog.getByLabel('API Key', { exact: true }).fill('sk-test');
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Delete connector', exact: true })).toBeVisible();
});

for (const providerType of ['openai', 'azure', 'openai_compatible', 'web_request']) {
  test(`custom models are available for ${providerType} and survive refresh`, async ({ page }) => {
    await mockDiscovery(page, 'attempt-unsupported', { state: 'unsupported', message: 'Add a model ID manually.' });
    await mockVerification(page, { state: 'ready', verified: true });
    await page.addInitScript(type => localStorage.setItem('goldfin.connectors.v1', JSON.stringify([{
      id: 'custom', providerType: type, name: 'Custom connection', baseUrl: 'https://example.com/v1',
      apiKey: type === 'web_request' ? '' : 'sk-test', connectionStatus: 'idle', models: []
    }])), providerType);
    await page.goto('/connectors/');
    await page.getByRole('button', { name: 'Configure', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Discover models', exact: true }).click();
    const entry = dialog.getByLabel('Model ID', { exact: true });
    await entry.fill('custom-model');
    await entry.press('Enter');
    await expect(entry).toHaveValue('');
    const toggle = dialog.getByRole('switch', { name: 'custom-model', exact: true });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await mockDiscovery(page, 'attempt-ready', { state: 'ready', ids: ['catalog-model'], source: 'discovered', message: '1 model discovered.' });
    await dialog.getByRole('button', { name: 'Refresh catalog', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(dialog.getByRole('row', { name: /custom-model/ })).toContainText('Unverified');
  });
}

test('model table puts names before small toggles and scrolls without growing the panel', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('goldfin.connectors.v1', JSON.stringify([{
    id: 'many', providerType: 'openai', name: 'Many models', baseUrl: 'https://example.com', apiKey: '',
    connectionStatus: 'idle', catalogState: 'ready',
    models: Array.from({ length: 60 }, (_, index) => ({ id: `model-${index}`, enabled: false, source: 'manual' }))
  }])));
  await page.goto('/connectors/');
  await page.getByRole('button', { name: 'Configure', exact: true }).click();
  await expect.poll(() => page.getByRole('dialog').evaluate(node =>
    node.getAnimations().every(animation => animation.playState !== 'running')
  )).toBe(true);
  const table = page.getByRole('table', { name: 'Models', exact: true });
  const row = table.getByRole('row').nth(1);
  const name = await row.getByRole('rowheader').boundingBox();
  const toggle = row.getByRole('switch', { name: 'model-0', exact: true });
  const toggleBox = await toggle.boundingBox();
  expect(name.x).toBeLessThan(toggleBox.x);
  expect(toggleBox.width).toBe(28);
  expect(toggleBox.height).toBe(16);
  const scroll = page.getByRole('region', { name: 'Model list', exact: true });
  const before = await scroll.boundingBox();
  expect(await scroll.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await scroll.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(table.getByRole('switch', { name: 'model-59', exact: true })).toBeInViewport();
  expect((await scroll.boundingBox()).height).toBe(before.height);
});

for (const theme of ['light', 'dark']) {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 720 }]) {
    test(`compact Model ID entry fits ${viewport.width}px in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(value => localStorage.setItem('goldfin.theme', value), theme);
      await page.goto('/connectors/');
      if (viewport.width < 768) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      const parentBox = await page.getByRole('button', { name: 'Integrations', exact: true }).boundingBox();
      const childBox = await page.getByRole('link', { name: 'Connectors', exact: true }).boundingBox();
      expect(childBox.x - parentBox.x).toBe(32);
      const stem = await page.locator('#integrations-links > li').first().evaluate(node => {
        const rule = getComputedStyle(node, '::before');
        return {
          vertical: rule.borderInlineStartWidth, horizontal: rule.borderBlockEndWidth,
          height: parseFloat(rule.height), opacity: rule.opacity,
          end: parseFloat(rule.insetInlineStart) + parseFloat(rule.width)
        };
      });
      expect(stem.vertical).toBe('1px');
      expect(stem.horizontal).toBe('1px');
      expect(stem.height).toBeGreaterThan(10);
      expect(stem.end).toBe(-2);
      expect(stem.opacity).toBe('0.8');
      await page.locator('#primary-nav').screenshot({ path: `test-results/nav-${theme}-${viewport.width}.png` });
      if (viewport.width < 768) await page.getByRole('link', { name: 'Connectors', exact: true }).click();
      await mockDiscovery(page, 'attempt-unsupported', { state: 'unsupported', message: 'Add a model ID manually.' });
      await page.getByRole('button', { name: 'Add connector', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('API Key', { exact: true }).fill('sk-test');
      await dialog.getByRole('button', { name: 'Test', exact: true }).click();
      await dialog.getByRole('button', { name: 'Discover models', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Add model ID', exact: true })).toHaveCount(0);
      await expect(dialog.getByText('Sample and unverified IDs cannot be used in a Run.', { exact: true })).toHaveCount(0);
      const entry = dialog.getByLabel('Model ID', { exact: true });
      await entry.fill('custom-model');
      await entry.press('Enter');
      await expect(entry).toHaveValue('');
      await expect(dialog.getByRole('switch', { name: 'custom-model', exact: true })).toHaveAttribute('aria-checked', 'false');
      await entry.press('Enter');
      await entry.fill('custom-model');
      await entry.press('Enter');
      await expect(dialog.getByRole('switch', { name: 'custom-model', exact: true })).toHaveCount(1);
      const fieldBox = await dialog.getByLabel('API Key', { exact: true }).boundingBox();
      const footerBox = await dialog.locator('.connector-dialog-foot').boundingBox();
      expect(footerBox.y - (fieldBox.y + fieldBox.height)).toBeLessThanOrEqual(24);
      const formBox = await dialog.locator('.connector-form-panel').boundingBox();
      const modelsBox = await dialog.locator('.model-panel').boundingBox();
      if (viewport.width >= 768) {
        expect(Math.abs((formBox.y + formBox.height / 2) - (modelsBox.y + modelsBox.height / 2))).toBeLessThanOrEqual(1);
      } else {
        expect(modelsBox.y).toBeGreaterThanOrEqual(formBox.y + formBox.height);
      }
      await dialog.locator('.connector-form-panel').evaluate(node => node.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: `test-results/compact-${theme}-${viewport.width}.png` });
      const scroll = dialog.getByRole('region', { name: 'Model list', exact: true });
      expect(await scroll.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
  }
}
