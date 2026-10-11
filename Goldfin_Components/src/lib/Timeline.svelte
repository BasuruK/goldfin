<script>
  let {
    layout = 'vertical',
    markers = 'solid',
    tone,
    leading = false,
    label = 'Timeline',
    count = 3,
    children
  } = $props();
</script>

<!-- The frame is the query container, so the layout follows the slot the
     Timeline was given. The list cannot query itself. -->
<div class="timeline-frame">
  <ol
    class={['timeline', leading && 'timeline-leading']}
    data-layout={layout}
    data-markers={markers}
    data-tone={tone}
    style:--timeline-columns={count}
    aria-label={label}
  >{@render children?.()}</ol>
</div>
