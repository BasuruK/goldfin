// Judgement rules live in CODING_STANDARDS.md; this file holds only what a tool can decide.
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '.svelte-kit/',
      '.stryker-tmp/',
      'build/',
      'reports/',
      'test-results/',
      'Goldfin_Components/',
      'prototypes/',
      'ref/',
      'src/lib/llm/.store.test-compiled.mjs'
    ]
  },
  ts.configs.recommendedTypeChecked,
  svelte.configs.recommended,
  {
    // A per-site `eslint-disable` must go once its violation is fixed.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    languageOptions: {
      parserOptions: { projectService: true, extraFileExtensions: ['.svelte'] }
    },
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it', 'test'] }
          ]
        }
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'variable', modifiers: ['const'], format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        // Object keys mirror wire formats: HTTP headers, proxy paths, API fields.
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null }
      ],
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      // No `paths.base`, and NAV hrefs are data, not route literals.
      'svelte/no-navigation-without-resolve': 'off'
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } }
  },
  {
    // A fetch mock must return a Promise; `async` is the idiom, not a missing await.
    files: ['tests/**'],
    rules: { '@typescript-eslint/require-await': 'off' }
  }
);
