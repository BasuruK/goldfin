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
