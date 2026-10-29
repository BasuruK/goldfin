import { browser } from '$app/env';

/* Everything the shell owns above the content: the sidebar's state, the two
   settings more than one screen reads, and the keyboard and focus rules for the
   layers stacked over the page. Routes read state from here; none of them
   re-implement the media query, the keymap or the focus return.

   Storage throws in a locked-down profile, and this module is also evaluated
   while prerendering, where there is no window at all. */
const read = (key: string, fallback: string): string => {
  if (!browser) return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

/* Below this width the sidebar is a drawer rather than a rail. app.css carries
   the same boundary as a `max-width: 767px` and a `min-width: 768px` query, so
   if you move this number, move those two with it. */
const MOBILE_MAX = 767;

type ShellTheme = 'light' | 'dark';
type SidebarMode = 'expanded' | 'collapsed';

interface ShellState {
  theme: ShellTheme;
  sidebarMode: SidebarMode;
  mobile: boolean;
  drawerOpen: boolean;
  profileOpen: boolean;
  integrationsOpen: boolean;
  integrationsAnimate: boolean;
}

interface ShellHandles {
  sidebarToggle: HTMLElement | null;
  sidebar: HTMLElement | null;
  profileButton: HTMLElement | null;
}

type NavIcon = 'home' | 'file' | 'plug';

interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const SIDES: ReadonlyArray<{ value: SidebarMode; label: string }> = [
  { value: 'expanded', label: 'Expanded' },
  { value: 'collapsed', label: 'Collapsed' }
];

/* Nav is grouped so the sidebar can head each block with a separator. The group
   label is not a second source of truth for what exists — only the sections
   below decide that. */
export function isGroupedNavPath(pathname: string): boolean {
  return NAV.some(
    group => group.label && group.items.some(item => pathname.startsWith(item.href))
  );
}

export const NAV: NavGroup[] = [
  { items: [{ href: '/', label: 'Home', icon: 'home' }] },
  {
    label: 'Integrations',
    items: [
      { href: '/playground/', label: 'OCR Playground', icon: 'file' },
      { href: '/connectors/', label: 'Connectors', icon: 'plug' }
    ]
  }
];

export const shell = $state<ShellState>({
  theme: read('goldfin.theme', 'dark') === 'light' ? 'light' : 'dark',
  sidebarMode: read('goldfin.sidebar', 'expanded') === 'collapsed' ? 'collapsed' : 'expanded',
  mobile: false,
  drawerOpen: false,
  profileOpen: false,
  integrationsOpen: false,
  integrationsAnimate: false
});

/* Svelte will not export derived state from a module, so this stays a function.
   It is the one place that decides what a collapsed sidebar means. */
function isExpanded(): boolean {
  return shell.sidebarMode === 'expanded';
}

/* The shell's own DOM handles. They exist so focus can go back where it came
   from, and so no route has to know they exist. */
export const handles = $state<ShellHandles>({
  sidebarToggle: null,
  sidebar: null,
  profileButton: null
});

function persist(): void {
  if (!browser) return;
  try {
    localStorage.setItem('goldfin.theme', shell.theme);
    localStorage.setItem('goldfin.sidebar', shell.sidebarMode);
  } catch {
    /* private mode — the setting simply does not outlive the session */
  }
}

/* Theme lives on body so portaled UI inherits it, and app.html writes the same
   attribute before first paint. It is applied from here rather than as a side
   effect of the top-bar toggle, so the profile menu and the Settings route
   change it as well. */
export function syncShell(): void {
  document.body.dataset.theme = shell.theme;
  persist();
}

export function trackViewport(): () => void {
  const mq = matchMedia(`(max-width: ${MOBILE_MAX}px)`);
  const sync = (): void => {
    shell.mobile = mq.matches;
    // Leaving the breakpoint closes the drawer, so it cannot survive as an
    // invisible overlay over a screen it was never opened on.
    if (!shell.mobile) shell.drawerOpen = false;
  };
  sync();
  mq.addEventListener('change', sync);
  return () => mq.removeEventListener('change', sync);
}

/* Opening the drawer puts focus inside it, where Escape can then close it. */
export function focusSidebar(): void {
  handles.sidebar?.querySelector('button')?.focus();
}

/* Escape closes whatever is open and hands focus back to the control that opened
   it. With nothing open it does nothing at all, so it can never pull focus off
   whatever the user is actually typing into. */
export function closeLayers({ restoreFocus = false }: { restoreFocus?: boolean } = {}): void {
  const wasDrawer = shell.drawerOpen;
  const wasProfile = shell.profileOpen;
  if (!wasDrawer && !wasProfile) return;
  shell.drawerOpen = false;
  shell.profileOpen = false;
  if (!restoreFocus) return;
  if (wasDrawer) handles.sidebarToggle?.querySelector('button')?.focus();
  else handles.profileButton?.focus();
}

/* The toggle means one thing on a pointer and another on a narrow screen:
   below the breakpoint the rail is a drawer, so the same button opens it. When
   the drawer is closed from inside itself the control that opened it is off in
   the top bar, so focus has to go back there or it lands nowhere. */
export function toggleSidebar(): void {
  if (shell.mobile) {
    const wasOpen = shell.drawerOpen;
    shell.drawerOpen = !wasOpen;
    if (wasOpen) handles.sidebarToggle?.querySelector('button')?.focus();
    return;
  }
  shell.sidebarMode = isExpanded() ? 'collapsed' : 'expanded';
}

export function toggleProfile(): void {
  shell.profileOpen = !shell.profileOpen;
  // A 64px rail cannot legibly host the submenu, so it opens the rail first.
  if (shell.profileOpen && !isExpanded() && !shell.mobile) shell.sidebarMode = 'expanded';
}

export function toggleIntegrations(event: { detail: number }): void {
  shell.integrationsAnimate = event.detail > 0;
  if (!isExpanded() && !shell.mobile) {
    shell.sidebarMode = 'expanded';
    shell.integrationsOpen = true;
    return;
  }
  shell.integrationsOpen = !shell.integrationsOpen;
}
