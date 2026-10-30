<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = HTMLButtonAttributes & { variant?: string; size?: string };
  let {
    children,
    variant = '',
    size = '',
    class: className = '',
    type = 'button',
    ...rest
  }: Props = $props();
</script>
<button {...rest} {type} class={['btn', variant, size, className]}>{@render children?.()}</button>
