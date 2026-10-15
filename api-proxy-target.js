export function apiProxyTarget(value) {
  if (!value?.trim()) throw new Error('API_URL is not set. Copy .env.example to .env.');
  let url;
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
