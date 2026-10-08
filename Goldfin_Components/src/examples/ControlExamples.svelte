<script>
  import Checkbox from '../lib/Checkbox.svelte';
  import CheckboxGroup from '../lib/CheckboxGroup.svelte';
  import RadioGroup from '../lib/RadioGroup.svelte';
  import Switch from '../lib/Switch.svelte';
  import SwitchCard from '../lib/SwitchCard.svelte';
  import Input from '../lib/Input.svelte';
  import Select from '../lib/Select.svelte';
  import StatusSelect from '../lib/StatusSelect.svelte';
  import DropdownMenu from '../lib/DropdownMenu.svelte';
  import Tabs from '../lib/Tabs.svelte';
  import SegmentedControl from '../lib/SegmentedControl.svelte';
  import FileDrop from '../lib/FileDrop.svelte';
  import { modelError } from '../lib/validation.js';
  let modelId = $state('gpt-4o-minii');
  let currentModelError = $state(modelError('gpt-4o-minii'));
  let formats = $state(['json','csv']);
  let inputPrice = $state('0.15');
  let outputPrice = $state('0.60');
  let formatted = $state('formatted');
  let actionFeedback = $state('Choose a sample action.');
  const scorers = [
    {value:'exact',label:'Exact match',description:'Every field must match'},
    {value:'contains',label:'Contains',description:'Substring, case-insensitive'},
    {value:'judge',label:'LLM judge',description:'Scored by a model · sample'},
    {value:'regex',label:'Regex',description:'Runs server-side only',disabled:true}
  ];
  const models = [
    {value:'gpt-4o-mini',label:'gpt-4o-mini',note:'Fast · sample $0.15 / $0.60'},
    {value:'gpt-4o',label:'gpt-4o',note:'Most capable · sample $3.00 / $12.00'},
    {value:'claude-3-5-sonnet',label:'claude-3-5-sonnet',note:'Balanced · sample $1.50 / $6.00'}
  ];
  const modelFilters = [
    {value:'claude-sonnet-4-5',label:'claude-sonnet-4-5',note:'Balanced default'},
    {value:'gpt-4.1',label:'gpt-4.1',note:'Long-context reasoning'},
    {value:'gemini-2.5-pro',label:'gemini-2.5-pro',note:'Multimodal cases'},
    {value:'llama-3.3-70b-instruct',label:'llama-3.3-70b-instruct',note:'Open weights baseline'}
  ];
  const statuses = [
    {value:'queued',label:'Queued',note:'Waiting for a worker',tone:'ufg3'},
    {value:'running',label:'Running',note:'Scoring the suite',tone:'key'},
    {value:'passed',label:'Passed',note:'Every case inside threshold',tone:'ok'},
    {value:'failed',label:'Failed',note:'Threshold missed',tone:'bad'}
  ];
  const features = [
    {label:'Analytics',description:'Track page views and user interactions',checked:true,icon:'settings'},
    {label:'Error Logging',description:'Capture and report runtime errors',checked:true,icon:'error'},
    {label:'CDN Caching',description:'Serve static assets from the edge network',checked:false,icon:'file'},
    {label:'Auto Backup',description:'Take daily snapshots of your database',checked:false,icon:'copy'}
  ];
</script>
<section class="section" id="tabs"><div class="section-head"><h2 class="section-title">Tabs</h2><span class="section-id">Output · OCR text</span></div>
  <Tabs value="output" label="Result view" items={[{value:'output',label:'Output',content:'Sample JSON output: invoice INV-2024-001, amount 2499.00.'},{value:'ocr',label:'OCR text',content:'Sample OCR text: Invoice INV-2024-001 · Acme Corp · Amount 2,499.00.'}]}/>
</section>
<section class="section" id="segmented"><div class="section-head"><h2 class="section-title">Segmented control</h2><span class="section-id">Two-tone · single selection</span></div>
  <div class="grid-2"><div class="od-stack"><p class="label">Formatted</p><SegmentedControl bind:value={formatted} label="Output format" items={[{value:'formatted',label:'Formatted'},{value:'raw',label:'Raw'}]}/><span class="field-desc" role="status">{formatted === 'formatted' ? 'Formatted output selected.' : 'Raw output selected.'}</span></div>
  <div class="od-stack"><p class="label">Disabled</p><SegmentedControl value="on" label="Disabled sample" disabled items={[{value:'on',label:'On'},{value:'off',label:'Off'}]}/></div></div>
</section>
<section class="section" id="inputs"><div class="section-head"><h2 class="section-title">Input</h2><span class="section-id">Fields · prices · file drop</span></div>
  <div class="grid-2"><Input label="System prompt" value="gpt-4o-mini" placeholder="Enter model ID"/>
    <div class="field"><p class="label">Custom price (USD / 1M tokens)</p><div class="price-input"><label class="sr-only" for="inputPrice">Input price</label><span aria-hidden="true">in</span><input id="inputPrice" type="text" inputmode="decimal" bind:value={inputPrice}/><label class="sr-only" for="outputPrice">Output price</label><span aria-hidden="true">out</span><input id="outputPrice" type="text" inputmode="decimal" bind:value={outputPrice}/><span class="unit">USD</span></div></div></div>
  <div class="mt-16"><FileDrop/></div>
</section>
<section class="section" id="input-states"><div class="section-head"><h2 class="section-title">Input states</h2><span class="section-id">Default · error · success · disabled</span></div>
  <div class="grid-2">
    <Input label="Model ID" description="Checked against the local sample registry." bind:value={modelId} error={currentModelError} onblur={() => currentModelError = modelError(modelId)}/>
    <div class="od-stack"><Input label="Suite name" description="Shown in run history and export filenames." value="Invoice extraction · v2" message="Unique across the sample workspace."/><p class="field-msg ok">Name available in this sample.</p></div>
    <Input label="Run ID" description="Assigned by the runner when the run starts." value="run_8f2a91c4" disabled/>
    <Input label="System prompt" description="Sent with every request in the suite." value="Extract line items"/>
  </div><p class="field-desc mt-16">Edit Model ID, then leave the field. Try gpt-4o-mini to clear the error.</p>
</section>
<section class="section" id="selection"><div class="section-head"><h2 class="section-title">Checkbox · Radio · Switch</h2><span class="section-id">Two-tone · keyboard controls</span></div>
  <div class="grid-3">
    <div><p class="field-legend">Checkbox</p><div class="ctl-list"><Checkbox label="Stream responses" description="Partial output during the run" checked/><Checkbox label="Reuse prompt cache" description="Off on a suite's first run"/><Checkbox label="Record traces" description="Requires the Pro plan" checked disabled/></div></div>
    <div><p class="field-legend">Radio</p><RadioGroup label="Scorer" items={scorers} value="exact"/></div>
    <div><p class="field-legend">Switch</p><div class="ctl-list"><Switch label="Parallel requests" description="4 at a time" checked/><Switch label="Fail on first error" description="Stops the suite early"/><Switch label="Webhooks" description="Admin only" disabled/></div></div>
  </div>
  <div class="grid-2 mt-24">
    <div><p class="field-legend">Output formats · derived tri-state</p><CheckboxGroup label="All formats" bind:selected={formats} items={[{value:'json',label:'JSON'},{value:'csv',label:'CSV'},{value:'md',label:'Markdown'},{value:'html',label:'HTML'}]}/></div>
    <div><p class="field-legend">Boolean validity</p><div class="field-set ctl-list"><Switch label="Require approval" description="Gate the run behind a reviewer" invalid/><p class="field-msg error">Pick a reviewer before saving this suite.</p><Checkbox label="Enforce pass threshold" description="Applies to every case in the suite" checked invalid/><p class="field-msg error">Threshold is required once enforcement is on.</p></div></div>
  </div>
</section>
<section class="section switch-card-section" id="switch-cards"><div class="section-head"><h2 class="section-title">Switch card</h2><span class="section-id">Standard · small · badge</span></div>
  <div class="switch-card-grid">{#each features as feature (feature.label)}<SwitchCard {...feature}/>{/each}</div>
  <h3 class="switch-card-variant-title">Small toggle</h3><div class="switch-card-grid"><SwitchCard {...features[0]} size="sm"/><SwitchCard {...features[2]} size="sm"/></div>
  <h3 class="switch-card-variant-title">Toggle with badge</h3><div class="switch-card-grid"><SwitchCard {...features[0]} badge/><SwitchCard {...features[3]} badge/></div>
</section>
<section class="section" id="dropdowns"><div class="section-head"><h2 class="section-title">Dropdown</h2><span class="section-id">Single · multiple · status · actions</span></div>
  <div class="grid-3"><Select label="Model" items={models} value="gpt-4o-mini"/><Select label="Models" type="multiple" items={models} value={['gpt-4o-mini','claude-3-5-sonnet']}/>
    <StatusSelect label="With icons" value="active" items={[{value:'active',label:'Active',note:'Running normally',tone:'ok'},{value:'pending',label:'Pending',note:'Awaiting resources',tone:'num'},{value:'failed',label:'Failed',note:'Check logs',tone:'bad'}]}/></div>
  <div class="grid-2 mt-16"><StatusSelect label="Status filter" items={statuses}/><Select label="Model ID filter" items={modelFilters} value="claude-sonnet-4-5"/></div>
  <div class="od-cluster mt-16"><DropdownMenu label="Sample actions" items={[{value:'inspect',label:'Inspect sample'},{value:'duplicate',label:'Duplicate sample'},{value:'admin',label:'Admin action',disabled:true}]} onAction={action => actionFeedback = action === 'inspect' ? 'Sample inspected locally.' : 'Sample duplicated locally.'}/><span class="field-desc" role="status">{actionFeedback}</span></div>
  <p class="field-desc mt-16">Model IDs and price notes are retained sample content, not current pricing advice.</p>
</section>