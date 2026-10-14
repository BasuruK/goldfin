import { browser } from '$app/environment';

/** Matches `--duration-menu` in tokens.css. */
const MENU_MS = 200;

export function menuFadeMs() {
  if (!browser) return 0;
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : MENU_MS;
}
