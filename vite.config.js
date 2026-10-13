import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

// The component library is referenced from its source, never copied. `$goldfin`
// points at the library's src, so `$goldfin/lib/index.js` and
// `$goldfin/goldfin.css` resolve from any depth without a relative path
// climbing back out of src/.
const root = fileURLToPath(new URL('.', import.meta.url));
const goldfin = fileURLToPath(new URL('./Goldfin_Components/src', import.meta.url));
const lib = fileURLToPath(new URL('./src/lib', import.meta.url));
const DEFAULT_API_ADDR = '127.0.0.1:8080';

/** @param {string} apiAddr */
function apiProxyTarget(apiAddr) {
  const trimmed = (apiAddr || DEFAULT_API_ADDR).trim();
  if (!trimmed) {
    throw new Error('API_ADDR must not be empty.');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error('API_ADDR must be host:port without a scheme (the Go API listens over plain HTTP).');
  }
  if (!/^[\w.-]+:\d+$/.test(trimmed) && !/^\[[\da-f:]+\]:\d+$/i.test(trimmed)) {
    throw new Error('API_ADDR must look like 127.0.0.1:8080');
  }
  return `http://${trimmed}`;
}

/** @param {string} apiTarget */
function apiProxy(apiTarget) {
  return {
    '/api': {
      target: apiTarget,
      changeOrigin: true
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, 'API_');
  const apiTarget = apiProxyTarget(env.API_ADDR);

  return {
    plugins: [sveltekit({ adapter: adapter() })],
    server: {
      host: '127.0.0.1',
      fs: {
        allow: [root, goldfin]
      },
      proxy: apiProxy(apiTarget)
    },
    preview: {
      proxy: apiProxy(apiTarget)
    },
    resolve: {
      // `#lib` is declared here rather than left to SvelteKit: this project keeps its
      // config inline instead of in svelte.config.js, and kit does not register the
      // alias for the client bundle without one.
      // `$lib` is required by Impeccable live-inject; app code prefers `#lib`.
      alias: { $goldfin: goldfin, '#lib': lib, $lib: lib },
      // The library is consumed from source, so without this its own node_modules
      // would put a second svelte and bits-ui in the bundle. Two runtimes means
      // broken context. Dedupe forces one copy, the app's.
      dedupe: ['svelte', 'bits-ui', 'lineicons']
    }
  };
});
