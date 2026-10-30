<script lang="ts">
  import { Tabs as Primitive } from 'bits-ui';
  import TabList from './TabList.svelte';
  import TabTrigger from './TabTrigger.svelte';
  import TabContent from './TabContent.svelte';
  import type { Snippet } from 'svelte';

  type TabItem = {
    value: string;
    label: string;
    disabled?: boolean;
    content?: string;
    children?: Snippet;
  };

  let {
    value = $bindable(''),
    items,
    label = 'Views'
  }: {
    value?: string;
    items: readonly TabItem[];
    label?: string;
  } = $props();
  const active = $derived(value || items[0]?.value);
</script>
<Primitive.Root bind:value={() => active, next => { if (next) value = next; }}>
  <TabList {label}>
    {#each items as item (item.value)}
      <TabTrigger value={item.value} active={active === item.value} disabled={item.disabled}>
        {item.label}
      </TabTrigger>
    {/each}
  </TabList>
  {#each items as item (item.value)}
    <TabContent value={item.value}>
      {#if item.content}{item.content}{/if}
      {#if item.children}{@render item.children()}{/if}
    </TabContent>
  {/each}
</Primitive.Root>
