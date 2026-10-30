import { mount, type Component } from 'svelte';
import Select from '../src/lib/Select.svelte';
import Tabs from '../src/lib/Tabs.svelte';
import JSONViewer from '../src/lib/JSONViewer.svelte';
import RunButton from '../src/lib/RunButton.svelte';
import SegmentedControl from '../src/lib/SegmentedControl.svelte';
import SwitchCard from '../src/lib/SwitchCard.svelte';
import HarnessTimelines from './HarnessTimelines.svelte';
import '../src/goldfin.css';

function mountAt(
  id: string,
  component: Component,
  props?: Record<string, unknown>
) {
  const target = document.getElementById(id);
  if (!target) throw new Error(`Missing #${id} mount target.`);
  mount(component, { target, props });
}

// Mutable on purpose: the harness swaps value to test how each component reacts to new input.
const jsonProps = $state({ label: 'Harness JSON', value: { first: { a: 1 }, second: { b: 2 } } });

mountAt('select', Select as Component<Record<string, unknown>>, {
  label: 'Harness multi',
  type: 'multiple',
  items: [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' }
  ]
});
mountAt('tabs', Tabs as Component<Record<string, unknown>>, {
  label: 'Harness tabs',
  items: [
    { value: 'one', label: 'One', content: 'First panel' },
    { value: 'two', label: 'Two', content: 'Second panel' }
  ]
});
mountAt('json', JSONViewer as Component<Record<string, unknown>>, jsonProps);

const pendingRuns: Array<() => void> = [];
mountAt('run', RunButton as Component<Record<string, unknown>>, {
  onRun: () => new Promise<void>((resolve) => pendingRuns.push(resolve))
});
mountAt('seg', SegmentedControl as Component<Record<string, unknown>>, {
  label: 'Harness segments',
  value: 'missing',
  items: [
    { value: 'one', label: 'One' },
    { value: 'two', label: 'Two' }
  ]
});
mountAt('timelines', HarnessTimelines as Component<Record<string, unknown>>);
// Outside any .switch-card-grid on purpose: the card must carry its own spacing.
mountAt('switch-card', SwitchCard as Component<Record<string, unknown>>, {
  label: 'Harness card',
  description: 'Standalone'
});

window.harness = {
  setJson(value: unknown) {
    jsonProps.value = value as typeof jsonProps.value;
  },
  async finishOldestRun() {
    pendingRuns.shift()?.();
    await new Promise((resolve) => setTimeout(resolve));
  }
};
