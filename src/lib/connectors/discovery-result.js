/**
 * Maps worker discovery API payloads into the shape expected by finishDiscovery.
 */

/** @typedef {'queued' | 'running' | 'finished'} JobStatus */

/**
 * @param {{ status: JobStatus, result?: Record<string, unknown> }} attempt
 * @returns {{ state: string, ids?: string[], source?: string, message?: string } | null}
 */
export function discoveryAttemptToResult(attempt) {
  if (attempt.status !== 'finished') return null;
  if (!attempt.result) {
    return { state: 'failed', message: 'Discovery finished without a result.' };
  }
  const result = attempt.result;
  const state = typeof result.state === 'string' ? result.state : 'failed';
  if (state !== 'ready') {
    return { state, message: typeof result.message === 'string' ? result.message : '' };
  }
  const ids = Array.isArray(result.ids) ? result.ids.filter(id => typeof id === 'string') : [];
  return {
    state: 'ready',
    ids,
    source: typeof result.source === 'string' ? result.source : 'discovered',
    message: typeof result.message === 'string' ? result.message : ''
  };
}
