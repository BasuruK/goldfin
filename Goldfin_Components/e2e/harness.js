import { mount } from 'svelte';
import Select from '../src/lib/Select.svelte';
import Tabs from '../src/lib/Tabs.svelte';
import JSONViewer from '../src/lib/JSONViewer.svelte';
import RunButton from '../src/lib/RunButton.svelte';
import SegmentedControl from '../src/lib/SegmentedControl.svelte';
import { jsonProps } from './harness-props.svelte.js';
import '../src/goldfin.css';

mount(Select, {
  target: document.getElementById('select'),
  props: { label: 'Harness multi', type: 'multiple', items: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] }
});
mount(Tabs, {
  target: document.getElementById('tabs'),
  props: { label: 'Harness tabs', items: [{ value: 'one', label: 'One', content: 'First panel' }, { value: 'two', label: 'Two', content: 'Second panel' }] }
});
mount(JSONViewer, { target: document.getElementById('json'), props: jsonProps });

const pendingRuns = [];
mount(RunButton, {
  target: document.getElementById('run'),
  props: { onRun: () => new Promise(resolve => pendingRuns.push(resolve)) }
});
mount(SegmentedControl, {
  target: document.getElementById('seg'),
  props: { label: 'Harness segments', value: 'missing', items: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }] }
});

window.harness = {
  setJson(value) { jsonProps.value = value; },
  async finishOldestRun() {
    pendingRuns.shift()?.();
    await new Promise(resolve => setTimeout(resolve));
  }
};
