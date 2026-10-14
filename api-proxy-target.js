/** Keep in sync with `envOr("API_ADDR", …)` in cmd/goldfin/main.go */
export const DEFAULT_API_HOST = '127.0.0.1:8080';

export function apiProxyTarget(raw) {
  const addr = raw?.trim() || DEFAULT_API_HOST;
  if (/^https?:\/\//i.test(addr)) {
    return addr;
  }
  // Go binds all interfaces for `:8080`, `0.0.0.0:8080` and `[::]:8080`; none is a usable proxy target.
  const wildcardPort = addr.match(/^(?:0\.0\.0\.0|\[::\])?(:\d+)$/)?.[1];
  if (wildcardPort) {
    return `http://127.0.0.1${wildcardPort}`;
  }
  return `http://${addr}`;
}

/** Vite proxy: blank `API_ORIGIN` falls through to `API_ADDR`. */
export function resolveApiProxyTarget(apiOrigin, apiAddr) {
  return apiProxyTarget(apiOrigin?.trim() ? apiOrigin : apiAddr);
}
