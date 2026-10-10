<script>
  let { name = 'chevron', size } = $props();

  /** Goldfin icon names → Lineicons free font glyph (see lineicons `icons.scss`). */
  const glyphs = {
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

  const glyph = $derived(glyphs[name] ?? 'chevron-down');
</script>

<span
  class="icon lni lni-{glyph}"
  style:--icon-size={size !== undefined ? `${size}px` : undefined}
  aria-hidden="true"
></span>

<style>
  .icon {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--icon-size, 16px);
    block-size: var(--icon-size, 16px);
    font-size: var(--icon-size, 16px);
    line-height: 1;
    color: inherit;
  }
</style>
