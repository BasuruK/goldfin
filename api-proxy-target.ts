/** Stable api host when `make up` runs through portless compose (see docker-compose.yml). */
export const PORTLESS_API_ORIGIN = 'https://api.goldfin.localhost';

/** Pre-portless compose published the api on loopback :8080; portless compose no longer keeps that bind. */
const LEGACY_COMPOSE_API_ORIGIN = 'http://127.0.0.1:8080';

export function apiProxyTarget(value: string | undefined): string {
  if (!value?.trim()) throw new Error('API_URL is not set. Copy .env.example to .env.');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TypeError(`API_URL is not a valid URL: "${value}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`API_URL must be http(s), got ${url.protocol}`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('API_URL must be an origin only, e.g. http://127.0.0.1:8080');
  }
  return url.origin;
}

/** Resolves the Vite `/api` proxy target for local dev (portless compose + portless run). */
export function devApiProxyTarget(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return apiProxyTarget(PORTLESS_API_ORIGIN);
  const origin = apiProxyTarget(trimmed);
  return origin === LEGACY_COMPOSE_API_ORIGIN ? PORTLESS_API_ORIGIN : origin;
}
