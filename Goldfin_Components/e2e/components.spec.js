import { test, expect } from '@playwright/test';

let problems;

test.beforeEach(async ({ page }) => {
  problems = [];
  page.on('pageerror', error => problems.push('pageerror: ' + error.message));
  page.on('console', message => {
    if (!['error', 'warning'].includes(message.type()) || message.location().url.endsWith('/favicon.ico')) return;
    problems.push(`${message.type()}: ${message.text()} (${message.location().url})`);
  });
});

test.afterEach(() => {
  expect(problems.filter(problem => !problem.includes('Denied by test'))).toEqual([]);
});

const cssVar = (page, name) => page.evaluate(variable => {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}, name);

test.describe('showcase', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.timeline-item').first()).toBeVisible();
  });

  test('focus ring is 2px --ufg with 3px offset; slider and input keep overrides', async ({ page }) => {
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle, color: style.outlineColor };
    });
    expect(ring).toEqual({ width: '2px', offset: '3px', style: 'solid', color: await cssVar(page, '--ufg') });

    const thumb = page.locator('.gf-slider-thumb').first();
    await thumb.focus();
    await expect(thumb).toHaveCSS('outline-color', await cssVar(page, '--key'));

    const input = page.locator('input.input:not([disabled])').first();
    await input.focus();
    await expect(input).not.toHaveCSS('box-shadow', 'none');
  });

  test('Input clears a blur error while typing a valid value', async ({ page }) => {
    await page.getByRole('button', { name: 'New test suite' }).click();
    const dialog = page.getByRole('dialog');
    const field = dialog.getByLabel('Suite name');
    await field.fill('ab');
    await page.keyboard.press('Tab');
    await expect(dialog.locator('.field-msg.error')).toContainText('at least 3');

    await field.focus();
    await page.keyboard.press('End');
    await page.keyboard.type('c');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('abc');
    await expect(dialog.locator('.field-msg.error')).toHaveCount(0);
    await expect(field).not.toHaveAttribute('aria-invalid');
  });

  test('MosaicHeader peaks keep changing across a wave', async ({ page }) => {
    await page.getByRole('button', { name: 'Delete suite' }).click();
    const cells = page.getByRole('alertdialog').locator('.modal-mosaic-cell');
    await expect(cells.first()).toBeAttached();
    const peaks = () => cells.evaluateAll(all => all.map(cell => cell.style.getPropertyValue('--tile-peak')));
    const maxDelay = await cells.evaluateAll(all => Math.max(...all.map(cell => parseFloat(cell.style.getPropertyValue('--tile-delay')))));
    const before = await peaks();
    await page.waitForTimeout(5000 + maxDelay + 500);
    const after = await peaks();
    const changed = before.filter((value, index) => value !== after[index]).length;
    expect(changed).toBe(before.length);
  });

  test('FileDrop keeps the native input in step with accepted files', async ({ page }) => {
    const zone = page.locator('.gf-drop');
    const field = zone.locator('xpath=ancestor::div[contains(@class,"field")][1]');
    const input = zone.locator('input[type=file]');
    const files = () => input.evaluate(element => [...element.files].map(file => file.name));
    const drop = (name, type) => zone.evaluate((element, file) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['x'], file.name, { type: file.type }));
      element.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, { name, type });

    await expect(zone.locator('.name')).toHaveText('No file chosen');

    await drop('bad.png', 'image/png');
    await expect(field.locator('.field-msg.error')).toBeVisible();
    expect(await files()).toEqual([]);

    await drop('good.pdf', 'application/pdf');
    await expect(zone.locator('.name')).toHaveText('good.pdf');
    await expect(field.locator('.field-msg.error')).toHaveCount(0);
    expect(await files()).toEqual(['good.pdf']);

    await drop('bad.png', 'image/png');
    await expect(field.locator('.field-msg.error')).toBeVisible();
    expect(await files()).toEqual(['good.pdf']);

    await input.setInputFiles({ name: 'picked.png', mimeType: 'image/png', buffer: Buffer.from('x') });
    await expect(field.locator('.field-msg.error')).toBeVisible();
    expect(await files()).toEqual(['good.pdf']);
  });

  test('CopyButton failure inside the Copied window resets to failure', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const button = page.locator('.copy-btn');
    const status = button.locator('xpath=..').getByRole('status');

    await button.click();
    await expect(button).toHaveClass(/copied/);
    await expect(status).toHaveText('Copied to clipboard.');

    await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('Denied by test')), configurable: true }));
    await button.click();
    await expect(button).not.toHaveClass(/copied/);
    await expect(status).toHaveText('Denied by test');

    await page.waitForTimeout(2000);
    await expect(button).not.toHaveClass(/copied/);
    await expect(status).toHaveText('Denied by test');
  });

  test('Timeline marks current steps and toggles details', async ({ page }) => {
    const current = await page.locator('.timeline-item[data-state=current]').count();
    expect(current).toBeGreaterThan(0);
    await expect(page.locator('.timeline-item[aria-current=step]')).toHaveCount(current);
    await expect(page.locator('.timeline-item[aria-current]:not([data-state=current])')).toHaveCount(0);

    const details = page.locator('.timeline-details');
    await expect(details).toHaveCount(4);
    await expect(page.locator('.timeline-details[open]')).toHaveCount(4);
    await details.first().locator('summary').click();
    await expect(details.first()).not.toHaveAttribute('open');
  });

  test('JSONViewer marks only lines ending in a null value', async ({ page }) => {
    const counts = await page.locator('.gf-json .jsonline').evaluateAll(lines => {
      const expected = lines.filter(line => /: null,?$/.test(line.querySelector('code').textContent)).length;
      const marked = lines.filter(line => line.querySelector('.mark').textContent === '●').length;
      const labelled = lines.filter(line => line.querySelector('.mark').getAttribute('aria-label') === 'Missing value').length;
      return { expected, marked, labelled };
    });
    expect(counts.marked).toBe(counts.expected);
    expect(counts.labelled).toBe(counts.expected);
  });

  test('ARIA attributes stay valid across the page', async ({ page }) => {
    await expect(page.locator('[aria-invalid=false]')).toHaveCount(0);
    await expect(page.locator('output.slider-value[for]')).toHaveCount(0);
    const dangling = await page.evaluate(() => {
      const ids = new Set([...document.querySelectorAll('[id]')].map(element => element.id));
      return [...document.querySelectorAll('[aria-describedby]')]
        .flatMap(element => element.getAttribute('aria-describedby').split(/\s+/))
        .filter(id => !ids.has(id));
    });
    expect(dangling).toEqual([]);
    const meter = page.getByRole('meter');
    const now = Number(await meter.getAttribute('aria-valuenow'));
    const max = Number(await meter.getAttribute('aria-valuemax'));
    expect(max).toBeGreaterThanOrEqual(1);
    expect(now).toBeLessThanOrEqual(max);
  });

  test('dropdown triggers use the shared svg chevron', async ({ page }) => {
    const triggers = page.locator('.dd-trigger');
    expect(await triggers.count()).toBeGreaterThan(0);
    for (const trigger of await triggers.all()) {
      await expect(trigger.locator('svg')).toHaveCount(1);
      await expect(trigger).not.toContainText('⌄');
    }
  });

  test('visual snapshots for review', async ({ page }) => {
    await page.locator('#timelines').screenshot({ path: 'test-results/timelines.png' });
    await page.locator('.dd').first().locator('xpath=ancestor::section[1]').screenshot({ path: 'test-results/dropdowns.png' });
  });
});

test.describe('harness defaults', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/harness.html');
  });

  test('Select multiple without a value starts empty and counts choices', async ({ page }) => {
    const label = page.locator('#select .dd-label');
    await expect(label).toHaveText('0 selected');
    await page.locator('#select .dd-trigger').click();
    await page.getByRole('option', { name: 'Alpha' }).click();
    await expect(label).toHaveText('1 selected');
  });

  test('Tabs without a value activates the first tab', async ({ page }) => {
    await expect(page.locator('#tabs .tab.active')).toHaveText('One');
    await expect(page.getByText('First panel')).toBeVisible();
    await page.getByRole('tab', { name: 'Two' }).click();
    await expect(page.locator('#tabs .tab.active')).toHaveText('Two');
    await expect(page.getByText('Second panel')).toBeVisible();
  });

  test('JSONViewer keeps folds for the same JSON and drops them for new JSON', async ({ page }) => {
    const lines = page.locator('#json .jsonline');
    await expect(lines).toHaveCount(8);
    await lines.nth(1).click();
    await expect(lines).toHaveCount(6);
    await page.evaluate(() => window.harness.setJson({ first: { a: 1 }, second: { b: 2 } }));
    await expect(lines).toHaveCount(6);
    await page.evaluate(() => window.harness.setJson({ list: [1, 2, 3] }));
    await expect(lines).toHaveCount(7);
    await expect(lines.nth(1)).toHaveAttribute('aria-expanded', 'true');
  });

  test('RunButton ignores a stopped run that finishes late', async ({ page }) => {
    const button = page.locator('#run .run-btn');
    const status = page.locator('#run [role="status"]');
    await button.click();
    await button.click();
    await expect(status).toHaveText('Run stopped.');
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => window.harness.finishOldestRun());
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(status).toHaveText('Running main LLM test case…');
    await page.evaluate(() => window.harness.finishOldestRun());
    await expect(status).toHaveText('Test case complete.');
    await button.click();
    await button.click();
    await page.evaluate(() => window.harness.finishOldestRun());
    await expect(status).toHaveText('Run stopped.');
    await expect(button).toHaveAttribute('aria-busy', 'false');
  });

  test('SegmentedControl resolves an unknown value to the first item everywhere', async ({ page }) => {
    const first = page.locator('#seg .seg-btn').first();
    await expect(first).toHaveClass(/active/);
    await expect(first).toHaveAttribute('data-state', 'on');
    const [thumb, button] = await page.locator('#seg .seg').evaluate(el =>
      [el.querySelector('.seg-thumb'), el.querySelector('.seg-btn')].map(node => node.getBoundingClientRect().width));
    expect(thumb).toBeCloseTo(button, 0);
  });

  test('SegmentedControl thumb follows a segment that changes size', async ({ page }) => {
    const seg = page.locator('#seg .seg');
    await expect(seg).toHaveAttribute('data-ready', 'true');
    await page.addStyleTag({ content: '#seg .seg-btn { padding: 0 40px; }' });
    await expect.poll(() => seg.evaluate(el =>
      Math.round(el.querySelector('.seg-thumb').getBoundingClientRect().width - el.querySelector('.seg-btn').getBoundingClientRect().width))).toBe(0);
  });
});
