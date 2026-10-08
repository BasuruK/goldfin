import { test, expect, devices } from '@playwright/test';

/**
 * The point of this file: the motion and accessibility claims in DESIGN.md were all
 * reasoned from the stylesheet. This renders them. Anything here that fails is a real
 * defect, not a style opinion.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1.page-title')).toBeVisible();
});

/* ── focus restoration: the risk named as unverified in DESIGN.md ───────── */

test('closing a dialog returns focus to the control that opened it', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'New test suite' });
  await trigger.click();

  const dialog = page.locator('dialog.modal[open], .modal[data-state="open"], [role="dialog"]').first();
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // The dialog may need a beat to hand focus back.
  await expect.poll(async () => {
    const tag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    const text = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    return `${tag}:${text}`;
  }, { timeout: 2000 }).toContain('New test suite');
});

test('focus does not fall back to body after any dialog closes', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Delete suite' });
  await trigger.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const onBody = await page.evaluate(() => document.activeElement === document.body);
  expect(onBody).toBe(false);
});

/* ── F2: the dialog must be centred, including during its entrance ──────── */

test('the dialog is centred in the viewport, not merely near it', async ({ page }) => {
  await page.getByRole('button', { name: 'New test suite' }).click();
  const dialog = page.locator('.modal').first();
  await expect(dialog).toBeVisible();

  const drift = await page.evaluate(() => {
    const el = document.querySelector('.modal') as HTMLElement;
    const r = el.getBoundingClientRect();
    return Math.abs((r.left + r.width / 2) - window.innerWidth / 2);
  });
  expect(drift).toBeLessThan(2);
});

test('the entrance keyframe keeps the dialog centred on its first painted frame', async ({ page }) => {
  await page.getByRole('button', { name: 'New test suite' }).click();
  // Sample the entrance itself rather than the settled state: the old keyframe dropped
  // the centring translate for the whole 200ms.
  const worst = await page.evaluate(async () => {
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      const el = document.querySelector('.modal') as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        worst = Math.max(worst, Math.abs((r.left + r.width / 2) - window.innerWidth / 2));
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return worst;
  });
  expect(worst).toBeLessThan(2);
});

test('the mosaic band does not grow just because a description wrapped', async ({ page }) => {
  // The two headers have very different heights. A band masked in percent would render
  // the decoration at two different sizes for no reason other than line count.
  const band = async (label: string) => {
    await page.locator('.modal-head').first().waitFor();
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const head = document.querySelector('.modal-head') as HTMLElement;
      const mosaic = document.querySelector('.modal-head > .modal-mosaic') as HTMLElement | null;
      return {
        headHeight: Math.round(head.getBoundingClientRect().height),
        mask: mosaic ? getComputedStyle(mosaic).maskImage : '',
      };
    });
    console.log(label, r.headHeight, r.mask.slice(0, 80));
    return r;
  };

  await page.getByRole('button', { name: 'Delete suite' }).click();
  const destructive = await band('DELETE');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  await page.getByRole('button', { name: 'New test suite' }).click();
  const form = await band('NEW   ');

  // The headers genuinely differ, which is what made the bug visible.
  expect(destructive.headHeight).not.toBe(form.headHeight);
  // But the decoration must be masked from the header token, not from that height.
  // getComputedStyle resolves var(), so the token name is not visible here — what
  // matters is that both resolve identically and that no percentage survives.
  expect(form.mask).toBe(destructive.mask);
  expect(form.mask).not.toMatch(/\d+(\.\d+)?%/);
  // 48% of the 64px header token, pinned: the band must not track the taller header.
  expect(form.mask).toContain('64px');
});

/* ── F1: the button press ───────────────────────────────────────────────── */

test('pressing a button scales it rather than doing nothing', async ({ page }) => {
  const btn = page.locator('.btn').first();
  // The first .btn sits below the fold; page.mouse works in viewport coordinates, so an
  // unscrolled box silently misses the element and :active never applies.
  await btn.scrollIntoViewIfNeeded();
  const before = await btn.evaluate((el) => getComputedStyle(el).transform);
  expect(before === 'none' || before === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);

  const box = await btn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const active = await btn.evaluate((el) => el.matches(':active'));
  // The press transitions over 150ms; sampling immediately reads the identity start
  // value, not the scale. Wait past the transition and assert what it settles to.
  await page.waitForTimeout(250);
  const pressed = await btn.evaluate((el) => getComputedStyle(el).transform);
  await page.mouse.up();

  expect(active, 'the mouse press never reached the button').toBe(true);
  // scale(.97) => matrix(0.97, 0, 0, 0.97, 0, 0)
  expect(pressed).toBe('matrix(0.97, 0, 0, 0.97, 0, 0)');
});

/* ── F4: a loading button must not change size (DESIGN.md:174) ───────────── */

test('the loading spinner never changes the button box', async ({ page }) => {
  const btn = page.locator('#run .run-btn');
  await expect(btn).toBeVisible();

  const idle = await btn.boundingBox();
  await btn.click();
  await page.waitForTimeout(400);           // into the busy state
  const busy = await btn.boundingBox();

  expect(Math.abs(busy.width - idle.width)).toBeLessThan(1);
  expect(Math.abs(busy.height - idle.height)).toBeLessThan(1);
});

test('the spinner is centred on the button it belongs to', async ({ page }) => {
  const btn = page.locator('#run .run-btn');
  await btn.click();
  await page.waitForTimeout(400);
  const offset = await page.evaluate(() => {
    const b = document.querySelector('#run .run-btn') as HTMLElement;
    const s = b.querySelector('.sea') as HTMLElement | null;
    if (!s) return -1;
    const br = b.getBoundingClientRect(), sr = s.getBoundingClientRect();
    return Math.abs((sr.left + sr.width / 2) - (br.left + br.width / 2));
  });
  expect(offset).toBeLessThan(2);
});

/* ── F5: asymmetric label fade ──────────────────────────────────────────── */

test('the Run label fades faster on the way out than on the way in', async ({ page }) => {
  const btn = page.locator('#run .run-btn');
  const idle = await btn.evaluate((el) => getComputedStyle(el.querySelector('.label')).transitionDuration);
  await btn.click();
  await page.waitForTimeout(300);
  const busy = await btn.evaluate((el) => getComputedStyle(el.querySelector('.label')).transitionDuration);

  expect(idle).toBe('0.2s');
  expect(busy).toBe('0.4s');
});

/* ── responsive: DESIGN.md:115 requires 375px without page overflow ─────── */

test('no horizontal page overflow at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(150);
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client + 1);
});

/* ── reduced motion: mosaic must not animate, and must not burn frames ──── */

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the mosaic is not animating', async ({ page }) => {
    await page.getByRole('button', { name: 'New test suite' }).click();
    await page.locator('.modal').first().waitFor();
    const cell = page.locator('.modal-mosaic-cell').first();
    await expect(cell).toBeVisible();
    const name = await cell.evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('none');
  });
});

/* ── tokens must resolve in both themes ─────────────────────────────────── */

test('core tokens resolve in dark and light', async ({ page }) => {
  // The tokens carry both themes through light-dark(), so reading the raw custom
  // property returns the expression, not a colour. Assert the painted value
  // instead — that is what the reader actually sees.
  const read = () => page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return {
      scheme: s.colorScheme,
      bg: s.backgroundColor,
      fg: getComputedStyle(document.querySelector('.page-title')).color,
    };
  });

  await page.evaluate(() => document.body.removeAttribute('data-theme'));
  const dark = await read();
  expect(dark.scheme).toBe('dark');
  expect(dark.bg).toBe('oklch(0.18196 0.0044 264.46)');   // --ubg dark, #111214
  expect(dark.fg).toBe('oklch(0.96696 0.0029 264.54)');  // --ufg dark, #f3f4f6

  await page.evaluate(() => document.body.setAttribute('data-theme', 'light'));
  const light = await read();
  expect(light.scheme).toBe('light');
  expect(light.bg).toBe('oklch(1 0 none)');               // --ubg light, #ffffff

  expect(light.bg).not.toBe(dark.bg);
});