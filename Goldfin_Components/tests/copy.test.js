import test from 'node:test'; import assert from 'node:assert/strict'; import { createCopyTask, clipboardWrite } from '../src/lib/copy.js';

const fakeClock = () => {
  const timers = []; const delays = [];
  return { timers, delays, schedule: (fn, ms) => { timers.push(fn); delays.push(ms); return timers.length; }, unschedule: id => { timers[id - 1] = null; } };
};

test('a successful copy swaps the label and returns to the default one', async () => {
  const clock = fakeClock(); const states = []; const task = createCopyTask(next => states.push(next), { ...clock, write: text => text });
  await task.copy('INV-1');
  assert.deepEqual(states.at(-1), { copied: true, error: '' });
  clock.timers[0]();
  assert.deepEqual(states.at(-1), { copied: false, error: '' });
  assert.equal(task.copied, false);
});

test('the reset window is 1800ms by default', async () => {
  const clock = fakeClock(); const task = createCopyTask(() => {}, { ...clock, write: () => {} });
  await task.copy('INV-1');
  assert.equal(clock.delays[0], 1800);
});

test('a second copy restarts one window instead of stacking timers', async () => {
  const clock = fakeClock(); const task = createCopyTask(() => {}, { ...clock, write: () => {} });
  await task.copy('a');
  await task.copy('b');
  assert.equal(clock.timers.filter(Boolean).length, 1, 'the first window is cancelled, not left running');
  clock.timers[1]();
  assert.equal(task.copied, false);
});

test('a failure reports its message and never shows the copied state', async () => {
  const clock = fakeClock(); const states = []; const task = createCopyTask(next => states.push(next), { ...clock, write: () => { throw new Error('Denied by test'); } });
  await task.copy('a');
  assert.deepEqual(states.at(-1), { copied: false, error: 'Denied by test' });
  assert.equal(task.error, 'Denied by test');
  assert.equal(states.some(state => state.copied), false);
});

test('a failure inside the copied window cancels the reset and never revives the label', async () => {
  const clock = fakeClock(); const states = []; let deny = false;
  const task = createCopyTask(next => states.push(next), { ...clock, write: () => { if (deny) throw new Error('Denied by test'); } });
  await task.copy('a');
  deny = true;
  await task.copy('a');
  assert.deepEqual(states.at(-1), { copied: false, error: 'Denied by test' });
  assert.equal(clock.timers[0], null, 'the copied window is cleared by the failure');
  clock.timers[1]?.();
  assert.deepEqual(states.at(-1), { copied: false, error: 'Denied by test' });
});

test('a non-Error rejection falls back to the manual-copy message', async () => {
  const clock = fakeClock(); const task = createCopyTask(() => {}, { ...clock, write: () => Promise.reject('nope') });
  await task.copy('a');
  assert.equal(task.error, 'Copy failed. Select and copy the text manually.');
});

test('callbacks that land after destroy() are dropped', async () => {
  const clock = fakeClock(); const states = []; const task = createCopyTask(next => states.push(next), { ...clock, write: () => Promise.resolve() });
  task.destroy();
  await task.copy('a');
  assert.deepEqual(states, []);
  assert.equal(clock.timers.filter(Boolean).length, 0);
});

test('destroy() cancels a pending reset', async () => {
  const clock = fakeClock(); const task = createCopyTask(() => {}, { ...clock, write: () => {} });
  await task.copy('a');
  task.destroy();
  assert.equal(clock.timers[0], null);
});

test('the default writer names the browser requirement when there is no clipboard', () => {
  assert.throws(() => clipboardWrite('x'), /localhost or HTTPS/);
});