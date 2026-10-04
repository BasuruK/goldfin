<script>
  import { useId } from 'bits-ui';
  let { open = $bindable(true), first, second, label = 'result pane' } = $props();
  const id = useId();
</script><div class="gf-split"><div class="demo-pane">{@render first?.()}</div><div class="divider" class:collapsed={!open}><button type="button" class="knob" aria-expanded={open} aria-controls={id} aria-label={(open ? 'Collapse ' : 'Expand ') + label} onclick={() => open = !open}></button></div><div class="demo-pane" id={id} hidden={!open}>{@render second?.()}</div></div>