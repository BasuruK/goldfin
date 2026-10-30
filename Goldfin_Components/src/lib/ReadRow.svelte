<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    label,
    value,
    valueStyle = '',
    children
  }: {
    label?: string;
    value?: string;
    valueStyle?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="row">
  <span>{#if children}{@render children()}{:else}{label}{/if}</span>
  <span class="read" style={valueStyle || undefined}>{value}</span>
</div>
