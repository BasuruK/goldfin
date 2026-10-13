/** Keep in sync with `envOr("API_ADDR", …)` in cmd/goldfin/main.go */
export const DEFAULT_API_HOST = '127.0.0.1:8080';

export function apiProxyTarget(raw) {
  const addr = raw?.trim() || DEFAULT_API_HOST;
  if (/^https?:\/\//i.test(addr)) {
    return addr;
  }
  if (addr.startsWith('0.0.0.0:')) {
    return `http://127.0.0.1:${addr.slice('0.0.0.0:'.length)}`;
  }
  return `http://${addr}`;
}

/** Vite proxy: blank `API_ORIGIN` falls through to `API_ADDR`. */
export function resolveApiProxyTarget(apiOrigin, apiAddr) {
  return apiProxyTarget(apiOrigin || apiAddr);
}
