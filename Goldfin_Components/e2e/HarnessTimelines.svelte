<script lang="ts">
  import Timeline from '../src/lib/Timeline.svelte';
  import TimelineItem from '../src/lib/TimelineItem.svelte';
  const events = [
    { title: 'One', state: 'complete' },
    { title: 'Two', state: 'current' },
    { title: 'Three', state: 'pending' }
  ];
</script>

<!-- No .timeline-example wrapper: the Timeline must lay out from its own slot. -->
<div id="timeline-wide" style="inline-size: 900px">
  <Timeline layout="horizontal" count={events.length}>
    {#each events as event (event.title)}<TimelineItem {...event} />{/each}
  </Timeline>
</div>
<div id="timeline-narrow" style="inline-size: 360px">
  <Timeline layout="alternating">
    {#each events as event (event.title)}<TimelineItem {...event} />{/each}
  </Timeline>
</div>
