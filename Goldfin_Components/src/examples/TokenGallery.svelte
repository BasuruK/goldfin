<script>
  import Section from '../lib/Section.svelte';
</script><Section title="Tokens" reference="tokens.css · --ufg, --ufg2, --ufg3, --uline" data-od-id="tokens">

    <p style="color:var(--ufg3);font-size:13px;margin:0 0 16px;line-height:1.6">
      CSS custom properties on <code style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--key)">:root</code> (dark) and <code style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--key)">body[data-theme="light"]</code>.
      Apply with <code style="font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--num)">var(--token)</code>.
    </p>

    <p class="section-id" style="margin:0 0 16px">Each swatch lists the dark value on top, the light-theme override beneath it. Chip colour is always the dark value.</p>

    <!-- Foreground -->
    <p class="section-id" style="margin:0 0 8px">Foreground</p>
    <div class="swatch-grid" style="margin-bottom:20px">
      <div class="swatch"><div class="swatch-color" style="background:#f3f4f6"></div><span class="swatch-name">--ufg</span><span class="swatch-hex">#f3f4f6</span><span class="swatch-hex lt">#0f1115</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#b9bec6"></div><span class="swatch-name">--ufg2</span><span class="swatch-hex">#b9bec6</span><span class="swatch-hex lt">#3f4650</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#8c929b"></div><span class="swatch-name">--ufg3</span><span class="swatch-hex">#8c929b</span><span class="swatch-hex lt">#646b75</span></div>
    </div>

    <!-- Surface -->
    <p class="section-id" style="margin:0 0 8px">Surface layers</p>
    <div class="swatch-grid" style="margin-bottom:20px">
      <div class="swatch"><div class="swatch-color" style="background:#111214"></div><span class="swatch-name">--ubg</span><span class="swatch-hex">#111214</span><span class="swatch-hex lt">#ffffff</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#17181b"></div><span class="swatch-name">--usurf</span><span class="swatch-hex">#17181b</span><span class="swatch-hex lt">#f7f8f9</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#141518"></div><span class="swatch-name">--uwell</span><span class="swatch-hex">#141518</span><span class="swatch-hex lt">#fbfbfc</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#2a2c31"></div><span class="swatch-name">--uline</span><span class="swatch-hex">#2a2c31</span><span class="swatch-hex lt">#e4e6ea</span></div>
    </div>

    <!-- JSON -->
    <p class="section-id" style="margin:0 0 8px">JSON / syntax</p>
    <div class="swatch-grid" style="margin-bottom:20px">
      <div class="swatch"><div class="swatch-color" style="background:#60a5fa"></div><span class="swatch-name">--key</span><span class="swatch-hex">#60a5fa</span><span class="swatch-hex lt">#1d4ed8</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#cbd5e1"></div><span class="swatch-name">--str</span><span class="swatch-hex">#cbd5e1</span><span class="swatch-hex lt">#334155</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#fbbf24"></div><span class="swatch-name">--num</span><span class="swatch-hex">#fbbf24</span><span class="swatch-hex lt">#9a5a06</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#34d399"></div><span class="swatch-name">--ok</span><span class="swatch-hex">#34d399</span><span class="swatch-hex lt">#047857</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#f87171"></div><span class="swatch-name">--bad</span><span class="swatch-hex">#f87171</span><span class="swatch-hex lt">#c81e1e</span></div>
      <div class="swatch"><div class="swatch-color" style="background:#fbbf24"></div><span class="swatch-name">--warn</span><span class="swatch-hex">#fbbf24</span><span class="swatch-hex lt">#9a5a06</span></div>
    </div>

    <!-- Semantic -->
    <p class="section-id" style="margin:0 0 8px">Semantic</p>
    <div class="swatch-grid">
      <div class="swatch"><div class="swatch-color" style="background:rgba(248,113,113,.10);border-color:var(--bad)"></div><span class="swatch-name">--badbg</span><span class="swatch-hex">rgba / 10%</span><span class="swatch-hex lt">#fdeded</span></div>
      <div class="swatch"><div class="swatch-color" style="background:rgba(52,211,153,.10);border-color:var(--ok)"></div><span class="swatch-name">--okbg</span><span class="swatch-hex">rgba / 10%</span><span class="swatch-hex lt">#e5f5ee</span></div>
      <div class="swatch"><div class="swatch-color" style="background:rgba(63,116,216,.16);border-color:#3f74d8"></div><span class="swatch-name">--runchip</span><span class="swatch-hex">rgba / 16%</span><span class="swatch-hex lt">#e6eefc</span></div>
    </div>
  </Section>