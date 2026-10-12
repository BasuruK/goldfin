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
      message: '3 models',
      verifiedIds: ['gpt-4']
    }
  });
  assert.deepEqual(mapped, {
    state: 'ready',
    ids: ['gpt-4', 'gpt-4'],
    source: 'discovered',
    message: '3 models',
    verifiedIds: ['gpt-4']
  });
});

test('discoveryAttemptToResult ignores non-finished attempts', () => {
  assert.equal(discoveryAttemptToResult({ status: 'running' }), null);
});
