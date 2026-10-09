<script>
  import { useId } from 'bits-ui';
  let { open = $bindable(true), first, second, label = 'result pane' } = $props();
  const id = useId();
</script><div class="gf-split"><div class="demo-pane">{@render first?.()}</div><div class="divider" class:is-collapsed={!open}><button type="button" class="knob" aria-expanded={open} aria-controls={id} aria-label={(open ? 'Collapse ' : 'Expand ') + label} onclick={() => open = !open}></button></div><div class="demo-pane" id={id} inert={!open}>{@render second?.()}</div></div>

<style>
  .gf-split { display: flex; min-block-size: 80px; max-inline-size: 500px; }
  .gf-split .demo-pane { padding: 12px; background: var(--usurf); font: 12px var(--font-mono); color: var(--ufg3); overflow-wrap: anywhere; }
  .gf-split .demo-pane:last-child { background: var(--uresult); }

  .divider { position: relative; flex: none; inline-size: 5px; background: var(--uline); cursor: col-resize; }
  .demo-pane:has(~ .divider.is-collapsed) { border-radius: 8px; }

  /* The knob sits over the rule, so it needs `flex: none` and its own box.
     Centring it is a transform; keeping it there when motion is off is not a
     choice, it is the only way the knob lands on the rule. */
  .knob {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 50%;
    z-index: 3;
    display: grid;
    place-items: center;
    inline-size: 14px;
    block-size: 24px;
    padding: 0;
    border: 1px solid var(--urunline);
    border-radius: 7px;
    background: var(--urun);
    color: var(--ufg2);
    cursor: pointer;
    box-shadow: 0 2px 8px oklch(0% 0 none / 0.25);
    transform: translate(-50%, -50%);
    transition: color var(--duration-press) ease, border-color var(--duration-press) ease;
  }
  .knob::before { content: '>'; font-family: var(--font-mono); font-size: 11px; font-weight: 700; line-height: 1; }
  .knob[aria-expanded="false"]::before { content: '<'; }

  /* The collapsed state is a layout value, so it is declared unconditionally and
     only the slide between the two states is motion. */
  .demo-pane { flex: 1 1 0; overflow: clip; }
  .divider.is-collapsed ~ .demo-pane { flex: 0 0 0; padding-inline: 0; opacity: 0; }

  @media (hover: hover) and (pointer: fine) {
    .knob:hover { color: var(--ufg); border-color: var(--ufg3); }
  }

  @media (prefers-reduced-motion: no-preference) {
    .demo-pane { transition: flex-basis var(--duration-panel) var(--ease-out), padding var(--duration-panel) var(--ease-out), opacity var(--duration-menu) ease; }
  }
</style>