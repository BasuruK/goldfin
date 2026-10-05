<script>let { tone = 'ok', children, ...rest } = $props();</script><span {...rest} class="chip" data-tone={tone}><span class="chip-dot" aria-hidden="true"></span>{@render children?.()}</span>

<style>
  .chip { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 11px; border-radius: 999px; background: var(--upill); color: var(--ufg); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .chip-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--chip-fg); }
  .chip[data-tone="ok"]    { --chip-bg: var(--okbg); --chip-fg: var(--ok); }
  .chip[data-tone="running"]{ --chip-bg: var(--runchip); --chip-fg: var(--runchipfg); }
  .chip[data-tone="stopped"]{ --chip-bg: var(--upill); --chip-fg: var(--ufg3); }
  .chip[data-tone="error"]  { --chip-bg: var(--badbg); --chip-fg: var(--bad); }
</style>