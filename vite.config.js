import { fileURLToPath } from 'node:url';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { apiProxyTarget } from './api-proxy-target.js';

// The component library is referenced from its source, never copied. `$goldfin`
// points at the library's src, so `$goldfin/lib/index.js` and
// `$goldfin/goldfin.css` resolve from any depth without a relative path
// climbing back out of src/.
const root = fileURLToPath(new URL('.', import.meta.url));
const goldfin = fileURLToPath(new URL('./Goldfin_Components/src', import.meta.url));
const lib = fileURLToPath(new URL('./src/lib', import.meta.url));
const alias = { $goldfin: goldfin, '#lib': lib, $lib: lib };

export default defineConfig(({ command, mode }) => {
  // Dev and preview proxy /api; `vite build` needs no API_URL.
  const proxy = command === 'serve'
    ? { '/api': { target: apiProxyTarget(loadEnv(mode, root, 'API_').API_URL), changeOrigin: true } }
    : undefined;
  return {
    plugins: [sveltekit({
      adapter: adapter(),
      // Kit passes the same aliases to Vite and its generated type configuration.
      // `$lib` is required by Impeccable live-inject; app code prefers `#lib`.
      alias
    })],
    server: {
      proxy,
      fs: {
        allow: [root, goldfin]
      }
    },
    preview: {
      proxy
    },
    resolve: {
      alias,
      // The library is consumed from source, so without this its own node_modules
      // would put a second svelte and bits-ui in the bundle. Two runtimes means
      // broken context. Dedupe forces one copy, the app's.
      dedupe: ['svelte', 'bits-ui', 'lineicons']
    }
  };
});
