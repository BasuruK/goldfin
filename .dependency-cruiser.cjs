/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'goldfin-entry-point',
      severity: 'error',
      comment:
        'Every module outside Goldfin_Components/ (app, root config, tests) must import the design system only via $goldfin/lib/index.js (barrel) or $goldfin/goldfin.css — not deep paths under Goldfin_Components/. Code inside the package may import internals.',
      from: {
        pathNot: '^Goldfin_Components/',
      },
      to: {
        path: '^Goldfin_Components/',
        pathNot: [
          '^Goldfin_Components/src/lib/index\\.ts$',
          '^Goldfin_Components/src/goldfin\\.css$',
        ],
      },
    },
    {
      name: 'no-surface-to-surface',
      severity: 'error',
      comment:
        'A surface (a folder under src/lib/) imports only itself and shared modules (files directly in src/lib/). A route composes surfaces.',
      from: { path: '^src/lib/([^/]+)/' },
      to: { path: '^src/lib/[^/]+/', pathNot: '^src/lib/$1/' },
    },
    {
      name: 'shared-imports-no-surface',
      severity: 'error',
      comment: 'Shared modules (files directly in src/lib/) sit below every surface and import none.',
      from: { path: '^src/lib/[^/]+$' },
      to: { path: '^src/lib/[^/]+/' },
    },
    {
      name: 'lib-imports-no-route',
      severity: 'error',
      comment: 'Routes sit above src/lib/; nothing in src/lib/ imports a route.',
      from: { path: '^src/lib/' },
      to: { path: '^src/routes/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'This dependency is part of a circular relationship. Revise module boundaries or invert a dependency.',
      from: {},
      to: {
        circular: true,
      },
    },
  ],
  options: {
    // Count `import type` too: a type-only import couples two surfaces as much as a value import.
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(^|/)node_modules|\\.svelte-kit|(^|/)dist',
    },
  },
};
