<script>
  import '../app.css';

  let { children } = $props();
  let sidebarExpanded = $state(true);
</script>

<div class="app-shell" data-sidebar-expanded={sidebarExpanded}>
  <aside id="app-sidebar" class="app-sidebar" aria-label="Sidebar">
    <div class="app-brand" aria-label="Goldfin">
      <span class="logo-placeholder" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      </span>
      <span class="app-wordmark" hidden={!sidebarExpanded}>Goldfin</span>
    </div>
    <nav class="app-navigation" aria-label="Primary"></nav>
  </aside>

  <header class="app-header">
    <button
      class="sidebar-toggle"
      type="button"
      aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-expanded={sidebarExpanded}
      aria-controls="app-sidebar"
      onclick={() => (sidebarExpanded = !sidebarExpanded)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        {#if sidebarExpanded}
          <path d="m16 9-3 3 3 3" />
        {:else}
          <path d="m13 9 3 3-3 3" />
        {/if}
      </svg>
    </button>
  </header>

  <main class="app-content">
    {@render children()}
  </main>
</div>
