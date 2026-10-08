<script>
  import Section from '../lib/Section.svelte';

  // The chip always paints the live token, so the gallery cannot drift from
  // tokens.css. The label is documentation and is kept beside it.
  const groups = [
    { heading: 'Foreground', tokens: [
      { name: '--ufg', light: 'oklch(17.727% 0.0089 264.32)', dark: 'oklch(96.696% 0.0029 264.54)' },
      { name: '--ufg2', light: 'oklch(39.165% 0.0193 257.26)', dark: 'oklch(79.999% 0.0126 259.82)' },
      { name: '--ufg3', light: 'oklch(52.526% 0.0179 257.24)', dark: 'oklch(65.792% 0.0151 258.36)' }
    ] },
    { heading: 'Surface layers', tokens: [
      { name: '--ubg', light: 'oklch(100% 0 none)', dark: 'oklch(18.196% 0.0044 264.46)' },
      { name: '--usurf', light: 'oklch(97.865% 0.0017 247.84)', dark: 'oklch(20.924% 0.0061 271.12)' },
      { name: '--uwell', light: 'oklch(98.837% 0.0013 286.38)', dark: 'oklch(19.595% 0.0062 271.09)' },
      { name: '--uline', light: 'oklch(92.455% 0.0058 264.53)', dark: 'oklch(29.312% 0.0095 268.35)' }
    ] },
    { heading: 'JSON / syntax', tokens: [
      { name: '--key', light: 'oklch(48.82% 0.2172 264.38)', dark: 'oklch(71.374% 0.1434 254.62)' },
      { name: '--str', light: 'oklch(37.17% 0.0392 257.29)', dark: 'oklch(86.898% 0.0198 252.89)' },
      { name: '--num', light: 'oklch(52.939% 0.118 63.6)', dark: 'oklch(83.686% 0.1644 84.43)' },
      { name: '--ok', light: 'oklch(50.813% 0.1049 165.61)', dark: 'oklch(77.294% 0.1535 163.22)' },
      { name: '--bad', light: 'oklch(53.492% 0.2026 27.61)', dark: 'oklch(71.063% 0.1661 22.22)' },
      { name: '--warn', light: 'oklch(52.939% 0.118 63.6)', dark: 'oklch(83.686% 0.1644 84.43)' }
    ] },
    { heading: 'Semantic', tokens: [
      { name: '--badbg', light: 'oklch(95.875% 0.0174 17.46)', dark: 'color-mix(--bad 10%)', edge: true },
      { name: '--okbg', light: 'oklch(95.634% 0.0192 167.93)', dark: 'color-mix(--ok 10%)', edge: true },
      { name: '--runchip', light: 'oklch(94.721% 0.0207 261.77)', dark: 'oklch(57.504% 0.1637 261.7 / .16)', edge: true }
    ] }
  ];
</script>

<Section title="Tokens" reference="tokens.css · light-dark() · oklch" data-od-id="tokens">
  <p class="token-note">
    Every colour token holds both themes in one
    <code class="code-k">light-dark()</code> value on
    <code class="code-k">:root</code>, and the theme is chosen by
    <code class="code-k">color-scheme</code> rather than a second block of overrides.
    <code class="code-k">body[data-theme="light"]</code> still sets the theme,
    so portaled dialogs and menus inherit it. Apply a token with
    <code class="code-n">var(--token)</code>.
  </p>

  <p class="section-id token-note-sm">
    The chip paints the live token in the current theme. Each swatch lists the dark value
    first, then the light value. A true gray takes <code class="code-n">none</code> as its hue,
    so a later color-mix() cannot drag it toward red.
  </p>

  {#each groups as group (group.heading)}
    <p class="section-id token-group">{group.heading}</p>
    <div class="swatch-grid">
      {#each group.tokens as token (token.name)}
        <div class="swatch">
          <div class="swatch-color" class:edge={token.edge} style:background={'var(' + token.name + ')'}></div>
          <span class="swatch-name">{token.name}</span>
          <span class="swatch-hex">{token.dark}</span>
          <span class="swatch-hex lt">{token.light}</span>
        </div>
      {/each}
    </div>
  {/each}
</Section>

<style>
  .token-note { margin: 0 0 16px; color: var(--ufg3); font-size: 13px; line-height: 1.6; }
  .token-note-sm { margin: 0 0 8px; line-height: 1.6; }
  .token-group { margin: 20px 0 8px; }
  .swatch-grid { margin-block-end: 20px; }
  .swatch-grid:last-of-type { margin-block-end: 0; }
  /* An alpha tint has almost nothing to show on its own, so it gets an edge in
     the colour it is derived from. */
  .swatch-color.edge { border-color: var(--ufg3); }
  .code-k { font-family: var(--font-mono); font-size: 12px; color: var(--key); }
  .code-n { font-family: var(--font-mono); font-size: 12px; color: var(--num); }
</style>