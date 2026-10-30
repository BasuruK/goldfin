const NO_CLIPBOARD = 'Clipboard requires localhost or HTTPS.';
const FALLBACK = 'Copy failed. Select and copy the text manually.';

export function clipboardWrite(text: string): Promise<void> {
  if (!globalThis.navigator?.clipboard) throw new Error(NO_CLIPBOARD);
  return globalThis.navigator.clipboard.writeText(text);
}

export interface CopyState {
  copied: boolean;
  error: string;
}

export interface CopyOptions {
  write?: (text: string) => unknown;
  schedule?: (fn: () => void, delay: number) => number | undefined;
  unschedule?: (id: number | undefined) => void;
  delay?: number;
  fallback?: string;
}

export function createCopyTask(
  render: (state: CopyState) => void,
  {
    write = clipboardWrite,
    schedule = setTimeout,
    unschedule = clearTimeout,
    delay = 1800,
    fallback = FALLBACK
  }: CopyOptions = {}
) {
  let copied = false;
  let error = '';
  let timer: number | undefined = undefined;
  let alive = true;
  function clear() {
    if (timer !== undefined) {
      unschedule(timer);
      timer = undefined;
    }
  }
  return {
    async copy(text: string) {
      try {
        await write(text);
        if (!alive) return;
        copied = true;
        error = '';
        clear();
        timer = schedule(() => {
          timer = undefined;
          if (alive) {
            copied = false;
            render({ copied, error });
          }
        }, delay);
      } catch (cause) {
        if (!alive) return;
        clear();
        copied = false;
        error = cause instanceof Error ? cause.message : fallback;
      }
      render({ copied, error });
    },
    destroy() {
      alive = false;
      clear();
    },
    get copied() {
      return copied;
    },
    get error() {
      return error;
    }
  };
}
