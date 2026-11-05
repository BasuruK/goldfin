import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';

const ROOT = path.join(import.meta.dirname, '..');
/** bits-ui sets `--bits-<component>-*` on its floating content at runtime. */
const LIBRARY_PREFIX = '--bits-';
/** A declaration (`--gap: 8px`, also inside `style="…"`) or a Svelte directive (`style:--gap={gap}`). */
const DEFINITION = /(?<![\w-])--[\w-]+(?=\s*[:=])/g;
/** A use with no fallback: `var(--gap)`, not `var(--gap, 8px)`. */
const BARE_USE = /(?<=var\(\s*)--[\w-]+(?=\s*\))/g;

const files = globSync('{src,Goldfin_Components/src}/**/*.{css,svelte}', { cwd: ROOT }).map((file) => ({
  file,
  text: readFileSync(path.join(ROOT, file), 'utf8')
}));

/** A file's CSS: all of a stylesheet, or a component's `<style>` blocks with the rest blanked to newlines so line numbers still match. */
function cssOf(file: string, text: string): string {
  if (file.endsWith('.css')) return text;
  return text
    .split(/(<style[^>]*>[\s\S]*?<\/style>)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/[^\n]/g, '')))
    .join('');
}

// An undefined custom property makes the whole declaration invalid, so the property
// silently falls back to its initial value: no gap, no border, no focus ring.
it('every var() without a fallback names a custom property defined in src or the design system', () => {
  const defined = new Set(files.flatMap(({ text }) => text.match(DEFINITION) ?? []));
  const undefinedUses = files.flatMap(({ file, text }) => {
    const css = cssOf(file, text);
    return [...css.matchAll(BARE_USE)]
      .filter(([name]) => !defined.has(name) && !name.startsWith(LIBRARY_PREFIX))
      .map((use) => `${file}:${css.slice(0, use.index).split('\n').length} ${use[0]}`);
  });
  assert.deepEqual(undefinedUses, []);
});
