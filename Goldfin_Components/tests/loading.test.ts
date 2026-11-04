import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadingTask, sampleSuiteMatches } from '../src/lib/loading.ts';

test('createLoadingTask ignores duplicate starts, stale callbacks, and cancel paths', () => {
  const timers: Array<() => void> = [];
  const fire = (index: number) => {
    const callback = timers[index];
    assert.ok(callback, `timer ${index} was scheduled`);
    callback();
  };
  let done = 0;
  const task = createLoadingTask(
    () => {},
    (cb: () => void) => {
      timers.push(cb);
      return timers.length;
    },
    () => {},
  );

  assert(task.start(1, () => done++));
  assert.equal(task.start(), false);

  task.cancel();
  fire(0);
  assert.equal(done, 0);

  task.start(1, () => done++);
  fire(1);
  assert.equal(done, 1);
  assert.equal(task.state, 'complete');

  task.start();
  task.cancel('idle');
  fire(2);
  assert.equal(task.state, 'idle');
});

test('sampleSuiteMatches normalizes search text and returns empty for unknown queries', () => {
  assert.deepEqual(sampleSuiteMatches(' INVOICE '), ['invoice-extraction']);
  assert.deepEqual(sampleSuiteMatches('missing'), []);
  assert.deepEqual(sampleSuiteMatches(''), []);
});
