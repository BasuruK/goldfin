<script>
  import { useId } from 'bits-ui';
  let { open = $bindable(true), first, second, label = 'result pane' } = $props();
  const id = useId();
</script><div class="gf-split"><div class="demo-pane">{@render first?.()}</div><div class="divider" class:is-collapsed={!open}><button type="button" class="knob" aria-expanded={open} aria-controls={id} aria-label={(open ? 'Collapse ' : 'Expand ') + label} onclick={() => open = !open}></button></div><div class="demo-pane" id={id} inert={!open}>{@render second?.()}</div></div>

<style>
  .gf-split { display: flex; min-height: 80px; max-width: 500px; }
  .gf-split .demo-pane { padding: 12px; background: var(--usurf); font: 12px 'IBM Plex Mono', monospace; color: var(--ufg3); overflow-wrap: anywhere; }
  .gf-split .demo-pane:last-child { background: var(--uresult); }
  .gf-split .divider { width: 5px; flex: none; }
  .gf-split .knob { padding: 0; border: 0; color: var(--ufg); background: var(--usurf); }
  .divider { position: relative; background: var(--uline); cursor: col-resize; flex-shrink: 0; width: 5px; }
  .knob { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 3; display: grid; place-items: center; width: 14px; height: 24px; padding: 0; border: 1px solid var(--urunline); border-radius: 7px; background: var(--urun); color: var(--ufg2); cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.25); transition: color 150ms, border-color 150ms; }
  .knob::before { content: '>'; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 700; line-height: 1; }
  .knob[aria-expanded="false"]::before { content: '<'; }
  .knob:hover { color: var(--ufg); border-color: var(--ufg3); }
  .demo-pane { flex: 1 1 0; min-width: 0; overflow: hidden; transition: flex-basis 320ms cubic-bezier(.22,1,.32,1), padding 320ms cubic-bezier(.22,1,.32,1), opacity 200ms ease; }
  .divider.is-collapsed ~ .demo-pane { flex: 0 0 0; padding-left: 0; padding-right: 0; opacity: 0; }
  .demo-pane:has(~ .divider.is-collapsed) { border-radius: 8px; }
</style>