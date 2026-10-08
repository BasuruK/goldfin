const NO_CLIPBOARD = 'Clipboard requires localhost or HTTPS.';
const FALLBACK = 'Copy failed. Select and copy the text manually.';

export function clipboardWrite(text) {
  if (!globalThis.navigator?.clipboard) throw new Error(NO_CLIPBOARD);
  return globalThis.navigator.clipboard.writeText(text);
}

/* The clipboard, the clock and the render sink are injected so the reset window and the
   post-unmount guard are testable without a browser. destroy() stands in for onDestroy. */
export function createCopyTask(render, { write = clipboardWrite, schedule = setTimeout, unschedule = clearTimeout, delay = 1800, fallback = FALLBACK } = {}) {
  let copied = false;
  let error = '';
  let timer = null;
  let alive = true;
  function clear() { if (timer !== null) { unschedule(timer); timer = null; } }
  return {
    async copy(text) {
      try {
        await write(text);
        if (!alive) return;
        copied = true;
        error = '';
        clear();
        timer = schedule(() => { timer = null; if (alive) { copied = false; render({ copied, error }); } }, delay);
      } catch (cause) {
        if (!alive) return;
        clear();
        copied = false;
        error = cause instanceof Error ? cause.message : fallback;
      }
      render({ copied, error });
    },
    destroy() { alive = false; clear(); },
    get copied() { return copied; },
    get error() { return error; }
  };
}