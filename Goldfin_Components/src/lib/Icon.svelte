<script>
  import { glyphForName } from './icons.js';

  let { name = 'chevron', size } = $props();

  const glyph = $derived(glyphForName(name));
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
