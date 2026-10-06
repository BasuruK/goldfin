<script>
  import Button from '../lib/Button.svelte';
  import Icon from '../lib/Icon.svelte';
  import Pill from '../lib/Pill.svelte';
  import Chip from '../lib/Chip.svelte';
  import JSONViewer from '../lib/JSONViewer.svelte';
  import BudgetBar from '../lib/BudgetBar.svelte';
  import RunButton from '../lib/RunButton.svelte';
  import CopyButton from '../lib/CopyButton.svelte';
  import SplitPane from '../lib/SplitPane.svelte';
  import FieldGroup from '../lib/FieldGroup.svelte';
  import Input from '../lib/Input.svelte';
  let buttonFeedback = $state('Sample buttons · ready');
  const json = {invoice:{invoice_number:'INV-2024-001',amount:2499.00,due_date:null,vendor:'Acme Corp'},line_items:[{description:'Sample service',quantity:1},{description:'Sample support',quantity:2}]};
  const variants = [{name:'Standard',variant:''},{name:'Link button',variant:'link'},{name:'Text button',variant:'text'},{name:'Primary CTA',variant:'primary'},{name:'Warning',variant:'warning'},{name:'Delete',variant:'danger'}];
</script>
<section class="section" id="chips"><div class="section-head"><h2 class="section-title">Chip</h2><span class="section-id">Semantic status</span></div>
  {#each [{tone:'ok',text:'Success · 6.4 s'},{tone:'running',text:'Running · 3.2 s'},{tone:'stopped',text:'Stopped'},{tone:'error',text:'Error · timeout'}] as item (item.tone)}<div class="tone-row" style="margin-top:8px"><span class="tone-label">{item.tone}</span><Chip tone={item.tone}>{item.text}</Chip></div>{/each}
</section>
<section class="section" id="buttons"><div class="section-head"><h2 class="section-title">Button</h2><span class="section-id">Native button · Goldfin variants</span></div>
  <div class="grid-row"><Button size="icon" aria-label="Settings" onclick={() => buttonFeedback = 'Settings sample activated.'}><Icon name="settings" size={14}/></Button>{#each variants as item (item.name)}<Button variant={item.variant} onclick={() => buttonFeedback = item.name + ' sample activated.'}>{item.name}</Button>{/each}<Button disabled>Disabled</Button></div><p class="field-desc" role="status" style="margin-top:8px">{buttonFeedback}</p>
</section>
<section class="section" id="pills"><div class="section-head"><h2 class="section-title">Pill</h2><span class="section-id">Sample metadata</span></div>
  <div class="grid-row"><Pill>Latency: 6.4 s</Pill><Pill variant="inverted">Est. cost: $0.023</Pill><Pill variant="ok-pill">Σ 2,729 tokens</Pill><Pill variant="running-pill">Running · 3.2 s</Pill></div>
  <div class="grid-row" style="margin-top:8px"><Pill>Model: <span class="mono">gpt-4o</span></Pill><Pill variant="missing">3 missing<span class="sub"> · invoice_number (1/3)</span></Pill><Pill>Prompt: <span class="k">1,893</span> → <span class="n">836</span></Pill></div>
</section>
<section class="section" id="json"><div class="section-head"><h2 class="section-title">JSON viewer</h2><span class="section-id">Escaped data · expandable output</span></div><JSONViewer value={json} label="invoice.json"/><p class="field-desc" style="margin-top:8px">● = missing / null value. Click any line ending in &#123; or [ to fold its contents.</p></section>
<section class="section" id="budget"><div class="section-head"><h2 class="section-title">Budget bar</h2><span class="section-id">Prompt · completion · remaining</span></div><div style="max-width:400px"><BudgetBar prompt={1893} completion={836} maximum={4096}/></div></section>
<section class="section" id="run"><div class="section-head"><h2 class="section-title">Run button</h2><span class="section-id">Main LLM test case only</span></div><div style="max-width:320px"><RunButton sample/></div></section>
<section class="section" id="copy"><div class="section-head"><h2 class="section-title">Copy button</h2><span class="section-id">Clipboard · success / failure</span></div><CopyButton text={JSON.stringify(json,null,2)}/></section>
<section class="section" id="divider"><div class="section-head"><h2 class="section-title">Divider + knob</h2><span class="section-id">Result-pane disclosure</span></div><SplitPane>{#snippet first()}prompt.json{/snippet}{#snippet second()}result.json{/snippet}</SplitPane><p class="field-desc" style="margin-top:8px">The knob collapses or restores the result pane. Enter / Space works too.</p></section>
<section class="section" id="field-group"><div class="section-head"><h2 class="section-title">Field group</h2><span class="section-id">Sample pricing / last run</span></div>
  <div style="max-width:400px;padding:16px;background:var(--urun);border-radius:10px;border:1px solid var(--urunline)"><FieldGroup label="Model pricing" aside="USD · sample"><div class="price-grid"><Input label="Input / 1M" value="0.15" inputmode="decimal"/><Input label="Output / 1M" value="0.60" inputmode="decimal"/></div></FieldGroup><FieldGroup label="Last run" aside="14:32 · 6.4 s"><div class="row"><span>Prompt tokens</span><span class="read">1,893</span></div><div class="row"><span>Completion tokens</span><span class="read">836</span></div><div class="row"><span>Total cost</span><span class="read" style="color:var(--ok)">$0.023</span></div></FieldGroup></div>
</section>