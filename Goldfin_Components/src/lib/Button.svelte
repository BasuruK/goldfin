<script>
  let { children, variant = '', size = '', class: className = '', type = 'button', ...rest } = $props();
</script>
<button {...rest} {type} class={['btn', variant, size, className]}>{@render children?.()}</button>