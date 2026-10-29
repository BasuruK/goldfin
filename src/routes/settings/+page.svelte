<script lang="ts">
  import { Section, SegmentedControl } from '$goldfin/lib/index.js';
  import { SIDES, shell } from '#lib/shell.svelte.js';
</script>

<svelte:head>
  <title>Settings · Goldfin</title>
</svelte:head>

<!-- Theme is not here. It lives on the profile menu as one icon-only button,
     because a toggle you use daily does not belong behind a settings trip. One
     control means one place the state can be wrong. -->
<Section title="Appearance" id="appearance"
         legend="Theme is set from the profile menu, not here. The sidebar state below is the only appearance setting this screen carries.">
  <div class="settings-row">
    <span class="settings-label" id="setting-side">Sidebar</span>
    <SegmentedControl items={SIDES} label="Sidebar" bind:value={shell.sidebarMode} />
  </div>
</Section>

<Section title="About this screen" id="about">
  <p class="note">
    The component library is referenced from <code>$goldfin</code> rather than copied, so an
    edit there reaches this app instead of a frozen duplicate. The shell contributes only geometry —
    sidebar width, the rail collapse and the drawer; every colour, radius, duration and control style is
    the library's, imported once from <code>$goldfin/goldfin.css</code>.
  </p>
  <p class="note">
    Icons come from the free <code>lineicons</code> web font through <code>Icon.svelte</code> so every screen shares one family.
  </p>
  <p class="note">
    Both settings persist to <code>localStorage</code> under <code>goldfin.theme</code> and
    <code>goldfin.sidebar</code>, and the theme is applied on <code>body</code> so portaled UI inherits it.
    Nothing here reaches the API: this is a shell, and it has no backend to talk to yet.
  </p>
</Section>