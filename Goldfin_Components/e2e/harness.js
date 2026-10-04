import { mount } from 'svelte';
import Select from '../src/lib/Select.svelte';
import Tabs from '../src/lib/Tabs.svelte';
import '../src/goldfin.css';

mount(Select, {
  target: document.getElementById('select'),
  props: { label: 'Harness multi', type: 'multiple', items: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }] }
});
mount(Tabs, {
  target: document.getElementById('tabs'),
  props: { label: 'Harness tabs', items: [{ value: 'one', label: 'One', content: 'First panel' }, { value: 'two', label: 'Two', content: 'Second panel' }] }
});
