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
  import ReadRow from '../lib/ReadRow.svelte';
  import Section from '../lib/Section.svelte';
  import Input from '../lib/Input.svelte';
  let buttonFeedback = $state('Sample buttons · ready');
  const json = {invoice:{invoice_number:'INV-2024-001',amount:2499.00,due_date:null,vendor:'Acme Corp'},line_items:[{description:'Sample service',quantity:1},{description:'Sample support',quantity:2}]};
  const variants = [{name:'Standard',variant:''},{name:'Link button',variant:'link'},{name:'Text button',variant:'text'},{name:'Primary CTA',variant:'primary'},{name:'Warning',variant:'warning'},{name:'Delete',variant:'danger'}];
</script>
<Section title="Chip" reference="Semantic status" id="chips">
  {#each [{tone:'ok',text:'Success · 6.4 s'},{tone:'running',text:'Running · 3.2 s'},{tone:'stopped',text:'Stopped'},{tone:'error',text:'Error · timeout'}] as item (item.tone)}<div class="tone-row" style="margin-top:8px"><span class="tone-label">{item.tone}</span><Chip tone={item.tone}>{item.text}</Chip></div>{/each}
</Section>
<Section title="Button" reference="Native button · Goldfin variants" id="buttons">
  <div class="grid-row"><Button size="icon" aria-label="Settings" onclick={() => buttonFeedback = 'Settings sample activated.'}><Icon name="settings" size={14}/></Button>{#each variants as item (item.name)}<Button variant={item.variant} onclick={() => buttonFeedback = item.name + ' sample activated.'}>{item.name}</Button>{/each}<Button disabled>Disabled</Button></div><p class="field-desc" role="status" style="margin-top:8px">{buttonFeedback}</p>
</Section>
<Section title="Pill" reference="Sample metadata" id="pills">
  <div class="grid-row"><Pill>Latency: 6.4 s</Pill><Pill variant="inverted">Est. cost: $0.023</Pill><Pill variant="ok-pill">Σ 2,729 tokens</Pill><Pill variant="running-pill">Running · 3.2 s</Pill></div>
  <div class="grid-row" style="margin-top:8px"><Pill>Model: <span class="mono">gpt-4o</span></Pill><Pill variant="missing">3 missing<span class="sub"> · invoice_number (1/3)</span></Pill><Pill>Prompt: <span class="k">1,893</span> → <span class="n">836</span></Pill></div>
</Section>
<Section title="JSON viewer" reference="Escaped data · expandable output" id="json"><JSONViewer value={json} label="invoice.json"/><p class="field-desc" style="margin-top:8px">● = missing / null value. Click any line ending in &#123; or [ to fold its contents.</p></Section>
<Section title="Budget bar" reference="Prompt · completion · remaining" id="budget"><div style="max-width:400px"><BudgetBar prompt={1893} completion={836} maximum={4096}/></div></Section>
<Section title="Run button" reference="Main LLM test case only" id="run"><div style="max-width:320px"><RunButton sample/></div></Section>
<Section title="Copy button" reference="Clipboard · success / failure" id="copy"><CopyButton text={JSON.stringify(json,null,2)}/></Section>
<Section title="Divider + knob" reference="Result-pane disclosure" id="divider"><SplitPane>{#snippet first()}prompt.json{/snippet}{#snippet second()}result.json{/snippet}</SplitPane><p class="field-desc" style="margin-top:8px">The knob collapses or restores the result pane. Enter / Space works too.</p></Section>
<Section title="Field group" reference="Sample pricing / last run" id="field-group">
  <div style="max-width:400px;padding:16px;background:var(--urun);border-radius:10px;border:1px solid var(--urunline)"><FieldGroup label="Model pricing" aside="USD · sample"><div class="price-grid"><Input label="Input / 1M" value="0.15" inputmode="decimal"/><Input label="Output / 1M" value="0.60" inputmode="decimal"/></div></FieldGroup><FieldGroup label="Last run" aside="14:32 · 6.4 s"><ReadRow label="Prompt tokens" value="1,893"/><ReadRow label="Completion tokens" value="836"/><ReadRow label="Total cost" value="$0.023" valueStyle="color:var(--ok)"/></FieldGroup></div>
</Section>