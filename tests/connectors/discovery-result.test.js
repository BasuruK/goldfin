import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoveryAttemptToResult } from '../../src/lib/connectors/discovery-result.js';

test('discoveryAttemptToResult maps finished ready payloads', () => {
  const mapped = discoveryAttemptToResult({
    status: 'finished',
    result: {
      state: 'ready',
      ids: ['gpt-4', 'gpt-4'],
      source: 'discovered',
      message: '3 models'
    }
  });
  assert.deepEqual(mapped, {
    state: 'ready',
    ids: ['gpt-4', 'gpt-4'],
    source: 'discovered',
    message: '3 models'
  });
});

test('discoveryAttemptToResult maps finished jobs without result to failed', () => {
  assert.deepEqual(discoveryAttemptToResult({ status: 'finished' }), {
    state: 'failed',
    message: 'Discovery finished without a result.'
  });
});

test('discoveryAttemptToResult ignores non-finished attempts', () => {
  assert.equal(discoveryAttemptToResult({ status: 'running' }), null);
});
