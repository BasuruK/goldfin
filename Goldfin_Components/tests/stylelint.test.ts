import { test } from 'node:test';
import assert from 'node:assert/strict';
import stylelint from 'stylelint';
import { fileURLToPath } from 'node:url';
import hoverMedia from '../scripts/stylelint-hover-media.js';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const configPath = fileURLToPath(new URL('../stylelint.config.js', import.meta.url));

const lint = async (code) => {
  const { results } = await stylelint.lint({
    code,
    config: { plugins: [hoverMedia], rules: { 'goldfin/hover-in-hover-media': true } },
  });
  return results[0].warnings.map((warning) => warning.rule);
};

test('a bare :hover rule is rejected', async () => {
  assert.deepEqual(await lint('.btn:hover { color: red; }'), ['goldfin/hover-in-hover-media']);
});

test(':hover inside the full hover media query passes', async () => {
  assert.deepEqual(await lint('@media (hover: hover) and (pointer: fine) { .btn:hover { color: red; } }'), []);
});

test('a nested &:hover inside a nested hover media query passes', async () => {
  assert.deepEqual(await lint('.btn { @media (hover: hover) and (pointer: fine) { &:hover { color: red; } } }'), []);
});

test('(hover: hover) alone is not enough: a touch laptop still reports it', async () => {
  assert.deepEqual(await lint('@media (hover: hover) { .btn:hover { color: red; } }'), ['goldfin/hover-in-hover-media']);
});

const lintWithProjectConfig = async (code) => {
  const { results } = await stylelint.lint({ code, configFile: configPath, configBasedir: projectRoot });
  return results[0].warnings.map((warning) => warning.rule);
};

test('the project config bans physical sides, overflow: hidden and ease-in', async () => {
  const banned = [
    '.a { top: 0; }',
    '.a { margin-left: 4px; }',
    '.a { border-top-left-radius: 4px; }',
    '.a { overflow: hidden; }',
    '.a { outline: none; }',
    '.a { transition: all 1s; }',
    '.a { transition: opacity 1s ease-in; }',
  ];
  for (const code of banned) {
    assert.equal((await lintWithProjectConfig(code)).length, 1, code);
  }
});

test('the project config allows logical sides, overflow: clip and ease-in-out', async () => {
  const code = '.a { inset-block-start: 0; margin-inline-start: 4px; overflow: clip; animation: bob 3s ease-in-out infinite; }';
  assert.deepEqual(await lintWithProjectConfig(code), []);
});
