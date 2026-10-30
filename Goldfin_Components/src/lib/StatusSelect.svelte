<script lang="ts">
  // StatusSelect is Select with the dotted tone lead; items carry `tone`.
  import Select, { type SelectItem } from './Select.svelte';

  let {
    label,
    items,
    value = $bindable(''),
    placeholder = 'All statuses'
  }: {
    label: string;
    items: readonly SelectItem[];
    value?: string;
    placeholder?: string;
  } = $props();
</script>
<Select {label} {items} bind:value {placeholder} tone />
