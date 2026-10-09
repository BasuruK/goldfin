<script>let { tone = 'ok', children, ...rest } = $props();</script><span {...rest} class="chip" data-tone={tone}><span class="chip-dot" aria-hidden="true"></span>{@render children?.()}</span>

<style>
  .chip { display: inline-flex; align-items: center; gap: 7px; block-size: 28px; padding: 0 11px; border-radius: 999px; background: var(--upill); color: var(--ufg); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .chip-dot { flex: none; inline-size: 7px; block-size: 7px; border-radius: 50%; background: var(--chip-fg); }
  /* The tone drives the dot only. The pill body stays --upill in every tone, so
     --chip-bg was never read and has been removed. */
  .chip[data-tone="ok"]     { --chip-fg: var(--ok); }
  .chip[data-tone="running"] { --chip-fg: var(--runchipfg); }
  .chip[data-tone="stopped"] { --chip-fg: var(--ufg3); }
  .chip[data-tone="error"]   { --chip-fg: var(--bad); }
</style>