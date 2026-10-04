export function createLoadingTask(render, schedule = setTimeout, unschedule = clearTimeout) {
  let state = 'idle';
  let timer = null;
  let generation = 0;
  function publish(next) { state = next; render(next); }
  return {
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
    cancel(next = 'canceled') {
      generation++;
      if (timer !== null) unschedule(timer);
      timer = null;
      publish(next);
    },
    get state() { return state; }
  };
}

export function sampleSuiteMatches(query) {
  const suites = ['invoice-extraction', 'supplier-matching', 'payment-validation'];
  const normalized = query.trim().toLowerCase();
  return normalized ? suites.filter(name => name.includes(normalized)) : [];
}
