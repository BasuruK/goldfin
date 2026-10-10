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
};

/** @param {string} name */
export function glyphForName(name) {
  const glyph = GLYPHS[name];
  if (glyph === undefined) {
    throw new Error(`Icon: unknown name "${name}". Add it to GLYPHS in icons.js.`);
  }
  return glyph;
}
