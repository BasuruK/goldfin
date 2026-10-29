<script lang="ts">
  import { Chip, Section } from '$goldfin/lib/index.js';
</script>

<svelte:head>
  <title>Home · Goldfin</title>
</svelte:head>

<!-- Sample rows for a shell prototype. No Run below is real, and none of the
     numbers are claims about a product — they exist so the nav's active state,
     the theme switch and the rail collapse have something honest to sit against.
     State is spelled the way GLOSSARY.md spells it, and a State is a word and a
     tone together, never colour alone. -->
<Section title="Recent Runs" reference="SAMPLE DATA" id="recent"
         legend="What the Home route carries. A State is a word and a tone together, never colour alone.">
  <ul class="run-list">
    <li class="run-row">
      <div>
        <div class="run-name">Invoice field extraction</div>
        <div class="run-meta">invoice-set · prompt v4 · today 09:41</div>
      </div>
      <Chip tone="ok">scored</Chip>
    </li>
    <li class="run-row">
      <div>
        <div class="run-name">Vendor statement extraction</div>
        <div class="run-meta">statements-q3 · prompt v4 · today 08:12</div>
      </div>
      <Chip tone="running">running</Chip>
    </li>
    <li class="run-row">
      <div>
        <div class="run-name">Claim form extraction</div>
        <div class="run-meta">claims-2026 · prompt v3 · yesterday 16:55</div>
      </div>
      <Chip tone="error">failed</Chip>
    </li>
    <li class="run-row">
      <div>
        <div class="run-name">Remittance advice extraction</div>
        <div class="run-meta">remittances · prompt v3 · yesterday 11:30</div>
      </div>
      <Chip tone="stopped">cancelled</Chip>
    </li>
  </ul>
</Section>

<Section title="What this screen exercises" id="scope">
  <p class="note">
    The sidebar is the subject: <code>258px</code> expanded, collapsing to a <code>64px</code> rail on
    <code>--duration-panel</code>, and a full-width drawer below <code>768px</code> where the same button
    opens it instead. Both states stay a <code>nav</code> landmark and the toggle is a real button that
    keeps focus. The profile block is an ordinary disclosure — no modal, no focus trap — and it opens the
    rail first, because a 64px rail cannot legibly hold the submenu.
  </p>
  <p class="note">
    Every surface is the library's own: tokens and control styles come from
    <code>$goldfin/goldfin.css</code>, and icons, buttons, chips, sections, tables and the
    segmented control are imported from <code>$goldfin/lib/index.js</code>. The library is
    referenced from its source, never copied, so an edit to it reaches this app. Nothing on this screen
    calls a Connector, uploads a Document or records a Run.
  </p>
</Section>