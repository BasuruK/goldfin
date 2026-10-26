<script>
  import { page } from '$app/state';
  import { Avatar } from 'bits-ui';
  import { Button, Icon, ThemeToggle } from '$goldfin/lib/index.js';
  import { menuFadeMs } from '#lib/motion.js';
  import RailToggleIcon from '#lib/RailToggleIcon.svelte';
  import IntegrationsIcon from '#lib/IntegrationsIcon.svelte';
  import {
    NAV,
    isGroupedNavPath,
    closeLayers,
    focusSidebar,
    handles,
    shell,
    syncShell,
    toggleProfile,
    toggleIntegrations,
    toggleSidebar,
    trackViewport
  } from '#lib/shell.svelte.js';
  import { fade } from 'svelte/transition';
  import '../app.css';

  let { children } = $props();

  const expanded = $derived(shell.sidebarMode === 'expanded');
  const integrationsOpen = $derived(shell.integrationsOpen && (expanded || shell.mobile));

  /** @param {string} href */
  const isActive = href =>
    href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);

  $effect(() => trackViewport());
  $effect(() => syncShell());
  $effect(() => {
    if (isGroupedNavPath(page.url.pathname)) {
      shell.integrationsAnimate = false;
      shell.integrationsOpen = true;
    }
  });

  // A closed drawer is off-screen but still focusable, so the tab order runs
  // through it. inert takes it out of both tab order and the a11y tree, and
  // opening the drawer puts focus inside it, where Escape can then close it.
  $effect(() => {
    if (shell.mobile && shell.drawerOpen) focusSidebar();
  });

  $effect(() => {
    /** @param {KeyboardEvent} event */
    const onKey = event => {
      if (event.key === 'Escape') closeLayers({ restoreFocus: true });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
</script>

<div class="shell" data-sidebar={shell.sidebarMode} data-drawer={shell.drawerOpen ? 'open' : 'closed'} data-open={shell.profileOpen}>

  <nav class="sidebar" id="primary-nav" aria-label="Primary" bind:this={handles.sidebar} inert={shell.mobile && !shell.drawerOpen}>
    <div class="brand">
      <!-- The Goldfin mark, inlined so its ink follows the app theme rather
           than prefers-color-scheme: the two can disagree, and a logo that
           changes colour under a toggle the user just pressed reads as a bug. -->
      <svg class="brand-mark" viewBox="-475.69 -184.94 633.88 633.88" aria-label="Goldfin" role="img">
        <path fill="#ffc835" d="M-186.2 50.77L-211.46 80.88A88.99 88.99 0 0 1 -60.78 171.42A220 220 0 0 1 -190.4 296.06A220 220 0 0 0 72.59 82.65A73.33 73.33 0 0 1 79.64 -34.93A88.99 88.99 0 0 0 -43.43 -52.96Z" />
        <path fill="currentColor" d="M-186.2 50.77L-84.26 -70.71A110 110 0 0 1 71.84 -83.3L139.91 -44L109.19 -13.28A110 110 0 0 1 72.59 82.65A73.33 73.33 0 0 1 79.64 -34.93A88.99 88.99 0 0 0 -43.43 -52.96Z" />
        <path fill="currentColor" d="M-352.95 249.5L-211.46 80.88A88.99 88.99 0 0 1 -54.3 138.08A660 660 0 0 0 -352.95 249.5Z" />
        <path fill="currentColor" d="M-457.42 374L-352.95 249.5A440 440 0 0 0 -54.3 138.08A88.99 88.99 0 0 1 -115.79 222.72A1320 1320 0 0 0 -420.75 374Z" />
        <circle fill="currentColor" cx="27.5" cy="-44" r="16.05" />
      </svg>
      <span class="wordmark">Goldfin</span>
      <!-- The rail toggle lives with the rail it controls. On a phone the nav is
           a drawer, so the same control closes it and the top bar opens it. -->
      <span class="btn-slot">
        <Button class="icon" aria-expanded={shell.mobile ? shell.drawerOpen : expanded} aria-controls="primary-nav"
                aria-label={shell.mobile
                  ? 'Close navigation'
                  : expanded ? 'Collapse navigation' : 'Expand navigation'}
                onclick={toggleSidebar}>
          {#if shell.mobile}
            <Icon name="close" />
          {:else}
            <RailToggleIcon mirrored={!expanded} />
          {/if}
        </Button>
      </span>
    </div>

    <div class="nav-groups">
      {#each NAV as group (group.label ?? group.items[0].href)}
        <div class="nav-group">
          {#if group.label}
            <button class="nav-link nav-disclosure" type="button" title={group.label}
                    aria-expanded={integrationsOpen}
                    aria-controls="integrations-links" onclick={toggleIntegrations}>
              <IntegrationsIcon /><span class="nav-label">{group.label}</span>
              <span class="nav-chevron" data-open={integrationsOpen} data-animate={shell.integrationsAnimate} aria-hidden="true"><Icon name="chevron" size={14} /></span>
            </button>
          {/if}
          <div class="nav-reveal" data-open={!group.label || integrationsOpen}
               data-animate={!!group.label && shell.integrationsAnimate}
               aria-hidden={!!group.label && !integrationsOpen}
               inert={!!group.label && !integrationsOpen}>
            <div class="nav-reveal-clip">
          <ul class="nav-list" class:nav-sublist={!!group.label}
              id={group.label ? 'integrations-links' : undefined}>
            {#each group.items as item (item.href)}
              <li>
                <a class="nav-link" href={item.href} title={item.label} onclick={() => closeLayers()}
                   aria-current={isActive(item.href) ? 'page' : undefined}>
                  <Icon name={item.icon} /><span class="nav-label">{item.label}</span>
                </a>
              </li>
            {/each}
          </ul>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="sidebar-foot">
      <div class="profile-menu-reveal" data-open={shell.profileOpen} aria-hidden={!shell.profileOpen}>
        <div class="profile-menu-reveal__clip">
          <!-- An ordinary disclosure in normal flow: no portal, no focus trap. The
               surface and option rows are the library's own menu classes. -->
          <div class="dd-menu profile-menu" id="profile-menu" inert={!shell.profileOpen}>
            <!-- Theme sits alone at the top, above the separator, so it is one tap
                 from anywhere in the shell instead of sitting under a label. The
                 icon states the theme you are in: a sun for light, a crescent for
                 dark. The accessible name states the action, so the two never
                 have to agree — a picture cannot say "switch to". -->
            <button class="theme-swap" type="button"
                    tabindex={shell.profileOpen ? undefined : -1}
                    aria-label={'Switch to ' + (shell.theme === 'dark' ? 'light' : 'dark') + ' theme'}
                    title={'Switch to ' + (shell.theme === 'dark' ? 'light' : 'dark') + ' theme'}
                    onclick={() => (shell.theme = shell.theme === 'dark' ? 'light' : 'dark')}>
              <Icon name={shell.theme === 'dark' ? 'moon' : 'sun'} size={16} />
            </button>
            <hr class="gf-menu-sep menu-sep" />
            <a class="dd-opt" href="/settings/" tabindex={shell.profileOpen ? undefined : -1} onclick={() => closeLayers()}>
              <span class="dd-lead"><Icon name="settings" size={16} /></span>
              <span>Settings</span>
            </a>
          </div>
        </div>
      </div>
      <button class="profile" bind:this={handles.profileButton} aria-expanded={shell.profileOpen}
              aria-controls={shell.profileOpen ? 'profile-menu' : undefined} onclick={toggleProfile}>
        <span class="profile-avatar" aria-hidden="true">
          <Avatar.Root class="profile-avatar-root">
            <Avatar.Fallback class="profile-avatar-fallback">AF</Avatar.Fallback>
          </Avatar.Root>
        </span>
        <span class="profile-meta">
          <span class="profile-name">Ada Fields</span>
          <span class="profile-role">SAMPLE</span>
        </span>
        <span class="chev"><Icon name="chevron" /></span>
      </button>
    </div>
  </nav>

  {#if shell.drawerOpen}
    <button
      class="scrim"
      aria-label="Close navigation"
      in:fade={{ duration: menuFadeMs() }}
      out:fade={{ duration: menuFadeMs() }}
      onclick={() => closeLayers({ restoreFocus: true })}
    ></button>
  {/if}

  <div class="main">
    <header class="topbar">
      <!-- Desktop collapses the rail from inside the rail, so this control is the
           drawer's opener only and stays out of the way above the breakpoint. -->
      <span class="btn-slot drawer-opener" bind:this={handles.sidebarToggle}>
        <Button class="icon" aria-expanded={shell.drawerOpen} aria-controls="primary-nav"
                aria-label="Open navigation" onclick={toggleSidebar}>
          <Icon name="panel" />
        </Button>
      </span>
      <div class="topbar-end"><ThemeToggle bind:theme={shell.theme} /></div>
    </header>

    <main class="content">
      <div class="view">
        {@render children()}
      </div>
    </main>
  </div>
</div>
