import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  use: { baseURL: 'http://127.0.0.1:5175' },
  webServer: {
    command: 'pnpm run build && pnpm run preview:test',
    url: 'http://127.0.0.1:5175',
    timeout: 120_000
  }
});
