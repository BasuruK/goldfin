<script>
import Table from './Table.svelte';import Icon from './Icon.svelte';
const files = [
  {
    "id": 0,
    "name": "Q4 Financial Report.pdf",
    "sharing": "Team",
    "size": 2516582,
    "sizeLabel": "2.4 MB",
    "modified": 2,
    "modifiedLabel": "2 hours ago"
  },
  {
    "id": 1,
    "name": "Brand Guidelines",
    "sharing": "Public",
    "size": null,
    "sizeLabel": "—",
    "modified": 24,
    "modifiedLabel": "1 day ago"
  },
  {
    "id": 2,
    "name": "Product Roadmap 2025.xlsx",
    "sharing": "Private",
    "size": 876544,
    "sizeLabel": "856 KB",
    "modified": 72,
    "modifiedLabel": "3 days ago"
  },
  {
    "id": 3,
    "name": "App Screenshots",
    "sharing": "Team",
    "size": 50541363,
    "sizeLabel": "48.2 MB",
    "modified": 168,
    "modifiedLabel": "1 week ago"
  },
  {
    "id": 4,
    "name": "Architecture Diagram.fig",
    "sharing": "Restricted",
    "size": 13421773,
    "sizeLabel": "12.8 MB",
    "modified": 336,
    "modifiedLabel": "2 weeks ago"
  }
];
const cases = [
  {
    "id": "TC-421",
    "name": "Extract invoice line items",
    "type": "Extraction",
    "status": "Passed"
  },
  {
    "id": "TC-420",
    "name": "Match supplier identity",
    "type": "Matching",
    "status": "Running"
  },
  {
    "id": "TC-419",
    "name": "Validate payment terms",
    "type": "Validation",
    "status": "Failed"
  },
  {
    "id": "TC-418",
    "name": "Resolve invoice recipient",
    "type": "Matching",
    "status": "Queued"
  }
];
const fileColumns=[{key:'name',label:'Name',width:'44%'},{key:'sharing',label:'Sharing',width:'18%'},{key:'size',label:'Size',width:'16%'},{key:'modified',label:'Modified',width:'22%'}];
const caseColumns=[{key:'id',label:'ID',width:'16%'},{key:'name',label:'Test case',width:'44%'},{key:'type',label:'Type',width:'20%'},{key:'status',label:'Status',width:'20%'}];
</script><section class="section" id="tables"><div class="section-head"><h2 class="section-title">Table</h2><span class="section-id">Sortable · compact · no avatars</span></div><div class="table-stack">
<Table rows={files} columns={fileColumns} label="Plain · file listing" variant="plain" caption="Sample files, sharing permissions, sizes and modification times">
{#snippet cell(row, column)}{#if column.key === 'name'}<span class="table-name"><Icon name="file" size={20}/>{row.name}</span>{:else if column.key === 'sharing'}<span class="pill table-badge">{row.sharing}</span>{:else if column.key === 'size'}<span class="table-number">{row.sizeLabel}</span>{:else}<span class="table-muted">{row.modifiedLabel}</span>{/if}{/snippet}</Table>
<Table rows={cases} columns={caseColumns} label="Contained · test cases" caption="Sample test cases and evaluation states">
{#snippet cell(row, column)}{#if column.key === 'status'}<span class={['pill','table-badge',row.status === 'Passed' ? 'ok-pill' : row.status === 'Failed' ? 'missing' : row.status === 'Running' ? 'running-pill' : '']}>{row.status}</span>{:else if column.key === 'type'}<span class="pill table-badge">{row.type}</span>{:else}{row[column.key]}{/if}{/snippet}</Table>
</div></section>