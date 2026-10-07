<script>
  // StatusSelect is Select with the dotted tone lead; items carry `tone`.
  import Select from './Select.svelte';
  let { label, items, value = $bindable(''), placeholder = 'All statuses' } = $props();
</script>
<Select {label} {items} bind:value {placeholder} tone />