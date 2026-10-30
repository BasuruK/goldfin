export type LoadingState = 'idle' | 'running' | 'complete' | 'canceled';

type ScheduleFn = (fn: () => void, delay: number) => number | undefined;
type UnscheduleFn = (id: number | undefined) => void;

export function createLoadingTask(
  render: (state: LoadingState) => void,
  schedule: ScheduleFn = setTimeout,
  unschedule: UnscheduleFn = clearTimeout
) {
  let state: LoadingState = 'idle';
  let timer: number | undefined = undefined;
  let generation = 0;
  function publish(next: LoadingState) {
    state = next;
    render(next);
  }
  return {
    start(delay = 1600, complete: () => void = () => {}) {
      if (state === 'running') return false;
      const current = ++generation;
      publish('running');
      timer = schedule(() => {
        if (current !== generation || state !== 'running') return;
        timer = undefined;
        publish('complete');
        complete();
      }, delay);
      return true;
    },
    cancel(next: LoadingState = 'canceled') {
      generation++;
      if (timer !== undefined) unschedule(timer);
      timer = undefined;
      publish(next);
    },
    get state() {
      return state;
    }
  };
}

export function sampleSuiteMatches(query: string): string[] {
  const suites = ['invoice-extraction', 'supplier-matching', 'payment-validation'];
  const normalized = query.trim().toLowerCase();
  return normalized ? suites.filter((name) => name.includes(normalized)) : [];
}
