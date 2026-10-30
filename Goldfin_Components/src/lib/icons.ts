/** Goldfin icon names → Lineicons free font glyph (see lineicons `icons.scss`). */
export const GLYPHS = {
  arrow: 'arrow-right',
  branch: 'git',
  check: 'check',
  chevron: 'chevron-down',
  close: 'xmark',
  copy: 'clipboard',
  error: 'xmark-circle',
  file: 'file-multiple',
  home: 'home-2',
  info: 'info',
  link: 'link-2-angular-right',
  minus: 'minus',
  moon: 'moon-half-right-5',
  panel: 'layout-26',
  play: 'play',
  plug: 'plug-1',
  settings: 'gear-1',
  sun: 'sun-1',
  trash: 'trash-3'
} as const;

export type IconName = keyof typeof GLYPHS;

const glyphs = new Map<string, string>(Object.entries(GLYPHS));

export function glyphForName(name: string): string {
  return glyphs.get(name) ?? GLYPHS.chevron;
}
