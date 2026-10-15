import { expect, test } from '@playwright/test';
import { boxOf } from './support.js';

/* The shell's own behaviour: focus return, theme application and the boundary
   between a rail and a drawer. These are the rules the shell module owns, so
   they are tested here rather than inside any one route. */

test('Escape with nothing open leaves focus where the user left it', async ({ page }) => {
  await page.goto('/connectors/');

  const link = page.getByRole('link', { name: 'Connectors' });
  await link.focus();
  await expect(link).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(link).toBeFocused();
});

test('the profile menu theme button applies to the page without the top-bar toggle', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'dark');

  await page.locator('.profile').click();
  await page.locator('.theme-swap').click();

  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
});

test('a stored desktop collapse does not shrink the mobile drawer', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('goldfin.sidebar', 'collapsed'));
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Open navigation' }).click();

  const sidebar = page.locator('#primary-nav');
  await expect(page.getByText('Goldfin', { exact: true })).toBeVisible();
  expect((await boxOf(sidebar)).width).toBeCloseTo(258, 3);

  // `display: revert` rolled this back to the user-agent sheet rather than to
  // app.css, so the name and the role sat on one line inside the drawer.
  await expect(page.locator('.profile-meta')).toHaveCSS('display', 'grid');
});

test('the profile menu leads with a theme button that states the theme by icon', async ({ page }) => {
  await page.goto('/');
  await page.locator('.profile').click();

  const menu = page.locator('#profile-menu');
  const swap = menu.locator('.theme-swap');

  // Top of the menu, with the separator below it and Settings after that.
  const order = await menu.evaluate(node => [...node.children].map(n => n.className));
  expect(order[0]).toContain('theme-swap');
  expect(order[1]).toContain('menu-sep');
  expect(order[2]).toContain('dd-opt');

  // Icon-only means no text content at all, and the name carries the action.
  await expect(swap).toHaveText('');
  await expect(swap).toHaveAttribute('aria-label', 'Switch to light theme');
  expect(await swap.evaluate(n => getComputedStyle(n).boxShadow)).toContain('inset');

  // The icon names the theme you are in (Lineicons moon in dark, sun in light).
  await expect(swap.locator('.icon')).toHaveClass(/lni-moon-half-right-5/);

  await swap.click();
  await expect(swap).toHaveAttribute('aria-label', 'Switch to dark theme');
  await expect(swap.locator('.icon')).toHaveClass(/lni-sun-1/);
  await expect(page.locator('body')).toHaveAttribute('data-theme', 'light');
});

test('the theme button repaints the shell, not just the attribute', async ({ page }) => {
  await page.goto('/');
  await page.locator('.profile').click();

  /* The attribute alone proved nothing. `light-dark()` resolves against the
     color-scheme of the element that DECLARES the token, and the tokens are on
     :root while the toggle writes the attribute to body — so setting it on the
     body repainted the native controls and left every token on its dark value.
     This is the check that would have caught it. */
  const nav = page.locator('#primary-nav');
  const swap = page.locator('.theme-swap');
  const darkBg = await nav.evaluate(n => getComputedStyle(n).backgroundColor);
  await expect(nav).toHaveCSS('background-color', darkBg);

  await swap.click();

  await expect
    .poll(() => nav.evaluate(n => getComputedStyle(n).backgroundColor))
    .not.toBe(darkBg);
  // And back again, so the toggle is not one-way.
  await swap.click();
  await expect.poll(() => nav.evaluate(n => getComputedStyle(n).backgroundColor)).toBe(darkBg);
});

test('the theme button is compact, not stretched across the menu', async ({ page }) => {
  await page.goto('/');
  await page.locator('.profile').click();

  const menu = page.locator('#profile-menu');
  const swap = menu.locator('.theme-swap');
  const button = await boxOf(swap);
  const menuBox = await boxOf(menu);
  // A full-width bar holding one icon reads as a broken row, so the button is
  // sized to the glyph. Square-ish, not a menu-width strip.
  expect(button.width).toBeLessThan(48);
  expect(button.width).toBeLessThan(menuBox.width / 2);
  // Start-aligned so it shares an optical line with the Settings icon below.
  // Compared on the glyphs, not the borders: the row below has its own pad.
  /** @param {import('@playwright/test').Locator} locator */
  const centre = async locator => {
    const box = await boxOf(locator);
    return box.x + box.width / 2;
  };
  expect(await centre(swap.locator('.icon'))).toBeCloseTo(
    await centre(menu.locator('.dd-opt .icon')), 0);
});

test('Settings carries no theme control', async ({ page }) => {
  await page.goto('/settings/');

  // One place to set it, or there is somewhere for it to be wrong.
  await expect(page.getByRole('radio', { name: 'Dark' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Light' })).toHaveCount(0);
  await expect(page.getByText('Theme', { exact: true })).toHaveCount(0);
  // The sidebar setting is untouched.
  await expect(page.getByRole('radio', { name: 'Expanded' })).toHaveCount(1);
});

test('the collapsed rail centres every icon on the rail', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto('/');
  await page.locator('#primary-nav').getByRole('button', { name: 'Collapse navigation' }).click();
  await expect
    .poll(() => page.locator('#primary-nav').evaluate(n => n.getBoundingClientRect().width))
    .toBe(64);

  const centres = await page.evaluate(() => {
    /** @param {string} selector */
    const find = selector => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`${selector} is missing`);
      return el;
    };
    /** @param {Element} el */
    const mid = el => {
      const r = el.getBoundingClientRect();
      return +(r.x + r.width / 2).toFixed(1);
    };
    const nav = find('#primary-nav').getBoundingClientRect();
    return {
      rail: +(nav.x + nav.width / 2).toFixed(1),
      mark: mid(find('.brand-mark')),
      links: [...document.querySelectorAll('.nav-link > .icon, .nav-disclosure > svg')]
        .filter(el => getComputedStyle(el).visibility !== 'hidden').map(mid),
      avatar: mid(find('.profile-avatar'))
    };
  });

  // A flex `gap` outlives the sibling it separated, so centring the row used to
  // count a gap with no visible content and every icon sat left of centre.
  expect(centres.mark).toBe(centres.rail);
  expect(centres.links).toEqual(centres.links.map(() => centres.rail));
  expect(centres.avatar).toBe(centres.rail);
});

test('a closed drawer is inert on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto('/');

  const sidebar = page.locator('#primary-nav');
  await expect(sidebar).toHaveAttribute('inert', '');

  await page.getByRole('button', { name: 'Open navigation' }).click();

  await expect(sidebar).not.toHaveAttribute('inert', '');
});

test('the rail is collapsed from inside the rail, not from the top bar', async ({ page }) => {
  await page.goto('/');

  const nav = page.locator('#primary-nav');
  const toggle = nav.getByRole('button', { name: 'Collapse navigation' });
  await expect(toggle).toBeVisible();

  // Above the breakpoint the top bar holds only the theme control, so the
  // rail toggle is not duplicated there.
  await expect(page.locator('.topbar').getByRole('button', { name: 'Open navigation' })).toBeHidden();

  await toggle.click();

  await expect(nav.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
});

test('the brand row carries the Goldfin mark and an edge-straddling collapse toggle', async ({ page }) => {
  await page.goto('/');

  // The real mark, not the placeholder ring it replaced.
  const mark = page.locator('.brand-mark');
  await expect(mark).toBeVisible();
  expect(await mark.locator('path').count()).toBeGreaterThan(1);

  const nav = await boxOf(page.locator('#primary-nav'));
  const toggle = page.locator('#primary-nav').getByRole('button', { name: 'Collapse navigation' });
  const box = await boxOf(toggle);
  // Straddling means half out: the overhang has to be about half the button,
  // not merely positive. A margin alone can push a button past an edge but
  // cannot centre it on one.
  expect(box.x + box.width - (nav.x + nav.width)).toBeGreaterThan(box.width / 2 - 2);
  // And an oval, not a rounded square.
  const radius = await toggle.evaluate(node => getComputedStyle(node).borderRadius);
  expect(radius).toBe('999px');
  expect(box.height).toBeGreaterThan(box.width);
});

test('the collapse pill keeps a 40px desktop hit area around its small visible oval', async ({ page }) => {
  await page.goto('/');

  const pill = page.locator('#primary-nav').getByRole('button', { name: 'Collapse navigation' });
  const visible = await boxOf(pill);
  // Small enough to read as a handle on the bar rather than a second control.
  expect(visible.width).toBeLessThan(30);
  expect(await hitArea(pill)).toEqual({ width: 40, height: 40 });
});

test('the rail text exits on a transition rather than being removed from the DOM', async ({ page }) => {
  await page.goto('/');
  const label = page.locator('.nav-label').first();
  // Still the link's accessible name once collapsed, so it must stay in the DOM.
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();

  /* Sampled across frames instead of read once: the fade is over in about
     150ms and sampling after the click lands before or after it, which is a
     race either way. The proof that this is a fade rather than a snap is that
     some frame in between is neither opaque nor gone. */
  const trace = await page.evaluate(async () => {
    const node = document.querySelector('.nav-label');
    const toggle = document.querySelector('#primary-nav .brand > .btn-slot > .btn');
    if (!node || !(toggle instanceof HTMLElement)) throw new Error('nav label or brand toggle is missing');
    toggle.click();
    /** @type {number[]} */
    const seen = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(r => requestAnimationFrame(r));
      seen.push(+getComputedStyle(node).opacity);
    }
    const collapsed = getComputedStyle(node);
    return {
      seen,
      display: collapsed.display,
      transition: collapsed.transitionProperty,
      duration: collapsed.transitionDuration
    };
  });

  expect(trace.display).not.toBe('none');
  // A transition, so a collapse reversed mid-slide retargets instead of
  // restarting. A keyframe would report `animation`, not `transition`.
  expect(trace.transition).toContain('opacity');
  expect(parseFloat(trace.duration)).toBeGreaterThan(0);
  expect(trace.seen.some(o => o > 0.02 && o < 0.98)).toBe(true);

  // And the collapsed rail keeps the name for assistive tech at zero width.
  await expect.poll(() => label.evaluate(n => +n.getBoundingClientRect().width.toFixed(1))).toBe(0);
  await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveCount(1);
});

test('the collapse toggle straddles the edge in the collapsed rail too', async ({ page }) => {
  await page.goto('/');
  await page.locator('#primary-nav').getByRole('button', { name: 'Collapse navigation' }).click();
  await expect
    .poll(() => page.locator('#primary-nav').evaluate(node => node.getBoundingClientRect().width))
    .toBe(64);

  const nav = await boxOf(page.locator('#primary-nav'));
  const box = await boxOf(page.locator('#primary-nav').getByRole('button', { name: 'Expand navigation' }));
  // Absolute positioning is what keeps this true at both widths.
  expect(box.x + box.width - (nav.x + nav.width)).toBeGreaterThan(box.width / 2 - 2);
});

test('Connectors is grouped under the Integrations disclosure', async ({ page }) => {
  await page.goto('/');

  const group = page.getByRole('button', { name: 'Integrations', exact: true });
  await expect(group).toBeVisible();
  await group.click();
  await expect(page.locator('#integrations-links').getByRole('link', { name: 'Connectors' })).toBeVisible();
});

test('a collapsed rail keeps the Integrations control without showing child links', async ({ page }) => {
  await page.goto('/');
  await page.locator('#primary-nav').getByRole('button', { name: 'Collapse navigation' }).click();

  await expect(page.getByRole('button', { name: 'Integrations', exact: true })).toBeVisible();
  await expect(page.locator('#integrations-links')).toBeHidden();
  // The rail keeps its width: a heading word must never be what sets it. The
  // grid column animates, so this waits for the rail rather than sampling it
  // mid-slide.
  await expect
    .poll(() => page.locator('#primary-nav').evaluate(node => node.getBoundingClientRect().width))
    .toBe(64);
});

test.describe('on a touch device', () => {
  test.use({ viewport: { width: 375, height: 720 }, hasTouch: true, isMobile: true });

  test('the controls that open and close navigation meet the 44px touch target', async ({ page }) => {
    await page.goto('/');

    const opener = await boxOf(page.getByRole('button', { name: 'Open navigation' }));
    expect(opener.width).toBeGreaterThanOrEqual(44);
    expect(opener.height).toBeGreaterThanOrEqual(44);

    await page.getByRole('button', { name: 'Open navigation' }).click();

    // The brand toggle's hit area is its pseudo-element, not its box: the pill
    // stays small so it reads as an oval, and the target is grown around it.
    // boundingBox would report the oval and fail a control that is actually
    // reachable, so the area is measured the way the browser uses it.
    const closer = await hitArea(page.getByRole('button', { name: 'Close navigation' }).first());
    expect(closer.width).toBeGreaterThanOrEqual(44);
    expect(closer.height).toBeGreaterThanOrEqual(44);
  });
});

/* The clickable area of a control, including any pseudo-element that extends it.
   `.nav-pill` and the toggle keep a small visible box and a larger target, so
   the visible box alone under-reports what the user can actually press. */
/** @param {import('@playwright/test').Locator} locator */
async function hitArea(locator) {
  return locator.evaluate(node => {
    const r = node.getBoundingClientRect();
    const after = getComputedStyle(node, '::after');
    /** @param {string} value */
    const px = value => parseFloat(value) || 0;
    return {
      width: r.width - px(after.left) - px(after.right),
      height: r.height - px(after.top) - px(after.bottom)
    };
  });
}
