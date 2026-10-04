<script>
  import Timeline from './Timeline.svelte';
  import TimelineItem from './TimelineItem.svelte';
  const at = time => ({ time, datetime: '2026-10-04T' + time + ':00' });
  const complete = { state: 'complete', status: 'Complete' };
  const passed = { state: 'complete', status: 'Complete', statusVariant: 'ok-pill' };
  const current = { state: 'current', status: 'Current', statusVariant: 'running-pill' };
  const pending = { state: 'pending', status: 'Pending' };
  const failed = { state: 'failed', status: 'Failed', statusVariant: 'missing' };
  const stages = [
    { ...complete, time: 'Stage 1', title: 'Planning', description: 'Select sample cases.' },
    { ...current, time: 'Stage 2', title: 'Evaluation', description: 'Review sample responses.' },
    { ...pending, time: 'Stage 3', title: 'Reporting', description: 'Publish reviewed results.' }
  ];
  const examples = [
    { heading: 'Basic timeline', layout: 'vertical', markers: 'outline', events: [
      { ...complete, ...at('09:00'), title: 'Suite created', description: 'Invoice extraction cases added.' },
      { ...complete, ...at('09:10'), title: 'Baseline saved', description: 'Expected responses recorded.' },
      { ...pending, ...at('09:20'), title: 'Evaluation scheduled', description: 'Waiting for the next sample run.' }
    ] },
    { heading: 'Roadmap with date column', layout: 'date-column', markers: 'outline', dateColumn: true, events: [
      { ...complete, time: 'Week 1', title: 'Define test cases', description: 'Choose inputs and expected outcomes.' },
      { ...complete, time: 'Week 2', title: 'Review prompts', description: 'Check instructions against the suite.' },
      { ...current, time: 'Week 3', title: 'Evaluate responses', description: 'Compare outputs with expected results.' },
      { ...pending, time: 'Week 4', title: 'Publish report', description: 'Share reviewed findings.' }
    ] },
    { heading: 'Order status', layout: 'vertical', markers: 'solid', events: [
      { ...complete, ...at('09:00'), icon: 'check', title: 'Invoice received', description: 'Document queued for processing.' },
      { ...complete, ...at('09:02'), icon: 'check', title: 'Fields extracted', description: 'Invoice fields available for review.' },
      { ...current, ...at('09:03'), icon: 'spinner', title: 'ERP validation', description: 'Checking supplier and recipient identities.' },
      { ...pending, time: 'Next', title: 'Ready for transfer', description: 'Waiting for review approval.' }
    ] },
    { heading: 'Activity with icons', layout: 'vertical', markers: 'solid', events: [
      { ...complete, ...at('09:00'), icon: 'branch', title: 'Suite copied', description: 'Created a branch for prompt changes.' },
      { ...complete, ...at('09:05'), icon: 'branch', title: 'Prompt updated', description: 'Revised extraction instructions.' },
      { ...current, ...at('09:10'), icon: 'branch', title: 'Review requested', description: 'Submitted the sample change for review.' },
      { ...pending, time: 'Next', icon: 'branch', title: 'Baseline approved', description: 'Waiting for reviewer confirmation.' }
    ] },
    { heading: 'Alternating milestones', layout: 'alternating', markers: 'outline', events: [
      { ...complete, time: 'Phase 1', title: 'Case selection', description: 'Define the evaluation scope.' },
      { ...complete, time: 'Phase 2', title: 'Baseline', description: 'Record expected outputs.' },
      { ...current, time: 'Phase 3', title: 'Evaluation', description: 'Inspect model responses.' },
      { ...pending, time: 'Phase 4', title: 'Review', description: 'Resolve failed cases.' },
      { ...pending, time: 'Phase 5', title: 'Report', description: 'Publish reviewed results.' }
    ] },
    { heading: 'Collapsible evaluation pipeline', layout: 'vertical', markers: 'solid', collapsible: true, events: [
      { ...complete, ...at('09:00'), icon: 'check', title: 'Load test cases', description: 'Sample inputs loaded from the invoice extraction suite.' },
      { ...complete, ...at('09:01'), icon: 'check', title: 'Prepare prompts', description: 'Prompt template bound to the sample inputs.' },
      { ...current, ...at('09:02'), icon: 'spinner', title: 'Evaluate responses', description: 'Sample evaluation is in progress. Details can be collapsed while the marker remains visible.' },
      { ...pending, time: 'Next', title: 'Export report', description: 'The sample report becomes available after evaluation and review.' }
    ] },
    { heading: 'Compact roadmap items', layout: 'compact', markers: 'solid', events: [
      { ...complete, ...at('09:20'), title: 'Report ready' },
      { ...complete, ...at('09:15'), title: 'Review completed' },
      { ...complete, ...at('09:10'), title: 'Evaluation completed' },
      { ...complete, ...at('09:05'), title: 'Prompts prepared' },
      { ...complete, ...at('09:00'), title: 'Suite created' }
    ] },
    { heading: 'Horizontal timeline', layout: 'horizontal', markers: 'outline', events: stages },
    { heading: 'Horizontal timeline with leading labels', layout: 'horizontal', markers: 'outline', leading: true, dateColumn: true, events: stages },
    { heading: 'Evaluation status log', layout: 'vertical', markers: 'solid', tone: 'semantic', events: [
      { ...passed, ...at('09:30'), icon: 'check', title: 'Invoice extraction', meta: 'sample-208 · baseline', description: 'Sample run archived.' },
      { ...failed, ...at('09:20'), icon: 'close', title: 'Supplier matching', meta: 'sample-207 · prompt revision', description: 'Sample validation failed.' },
      { ...passed, ...at('09:10'), icon: 'check', title: 'Payment terms', meta: 'sample-206 · baseline', description: 'Sample run archived.' }
    ] },
    { heading: 'Compact horizontal milestones', layout: 'horizontal', markers: 'solid', tone: 'semantic', events: [
      { ...passed, time: 'Release 1', icon: 'check', title: 'v1.0', description: 'Initial sample suite.' },
      { ...passed, time: 'Release 2', icon: 'check', title: 'v1.1', description: 'Prompt fixes.' },
      { ...current, time: 'Release 3', icon: 'spinner', title: 'v2.0', description: 'Revised evaluation.' },
      { ...pending, time: 'Release 4', title: 'v2.1', description: 'Planned improvements.' }
    ] }
  ];
</script>
<section class="section" data-od-id="timelines" id="timelines"><div class="section-head"><h2 class="section-title">Timelines</h2><span class="section-id">.timeline · .timeline-item · details</span></div><p class="field-legend">Sample events · completed, current, pending and failed states · no avatars</p><div class="timeline-gallery od-stack">
  {#each examples as example (example.heading)}
    <article class="timeline-example od-stack"><h3>{example.heading}</h3><Timeline layout={example.layout} markers={example.markers} tone={example.tone} count={example.events.length} leading={example.leading ?? false} label={example.heading + ', sample events'}>{#each example.events as event (event.title)}<TimelineItem {...event} dateColumn={example.dateColumn} collapsible={example.collapsible} open={example.collapsible} summary="Step details" />{/each}</Timeline></article>
  {/each}
</div></section>
