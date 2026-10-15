/** @typedef {'idle' | 'running' | 'complete' | 'canceled'} LoadingState */

/**
 * @param {(state: LoadingState) => void} render
 * @param {typeof setTimeout} [schedule]
 * @param {typeof clearTimeout} [unschedule]
 */
export function createLoadingTask(render, schedule = setTimeout, unschedule = clearTimeout) {
  /** @type {LoadingState} */
  let state = 'idle';
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  let generation = 0;
  /** @param {LoadingState} next */
  function publish(next) { state = next; render(next); }
  return {
    /**
     * @param {number} [delay]
     * @param {() => void} [complete]
     */
    start(delay = 1600, complete = () => {}) {
      if (state === 'running') return false;
      const current = ++generation;
      publish('running');
      timer = schedule(() => {
        if (current !== generation || state !== 'running') return;
        timer = null;
        publish('complete');
        complete();
      }, delay);
      return true;
    },
    /** @param {LoadingState} [next] */
    cancel(next = 'canceled') {
      generation++;
      if (timer !== null) unschedule(timer);
      timer = null;
      publish(next);
    },
    get state() { return state; }
  };
}

/** @param {string} query */
export function sampleSuiteMatches(query) {
  const suites = ['invoice-extraction', 'supplier-matching', 'payment-validation'];
  const normalized = query.trim().toLowerCase();
  return normalized ? suites.filter(name => name.includes(normalized)) : [];
}
