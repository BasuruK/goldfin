<script>
  import ConfirmDialog from '../lib/ConfirmDialog.svelte';
  import Dialog from '../lib/Dialog.svelte';
  import Input from '../lib/Input.svelte';
  import Button from '../lib/Button.svelte';
  import { suiteError } from '../lib/validation.js';
  let deleteFeedback = $state('Local sample · invoice-extraction');
  let connected = $state(false);
  let pairFeedback = $state('Sample device · not connected');
  let name = $state('invoice-extraction');
  let error = $state('');
  let suiteFeedback = $state('Local sample · no suite created');
  function create(close) {
    error = suiteError(name);
    if (error) return;
    suiteFeedback = 'Sample suite created: ' + name.trim();
    close();
  }
</script>
<section class="section" id="dialogs">
  <div class="section-head"><h2 class="section-title">Modal dialog</h2><span class="section-id">Shared mosaic · divided footer</span></div>
  <div class="grid-2" style="align-items:start">
    <div class="od-stack">
      <p class="field-legend">Destructive</p>
      <ConfirmDialog trigger="Delete suite" title="Delete invoice-extraction?" description="12 cases, 3 runs and every result stored with them. This cannot be undone." action="Delete suite" icon="trash" tone="bad"
        onConfirm={() => { deleteFeedback = 'Sample suite deleted.'; }}
        onResult={result => { if (result === 'canceled') deleteFeedback = 'Deletion canceled. Sample suite retained.'; }}/>
      <p class="field-desc" role="status">{deleteFeedback}</p>
    </div>
    <div class="od-stack">
      <p class="field-legend">Form</p>
      <Dialog trigger="New test suite" title="New test suite" description="Keys every run record for this suite.">
        <Input label="Suite name" bind:value={name} required validate={suiteError} {error} message="At least 3 characters; checked on blur and submit."/>
        {#snippet actions({ close })}<Button variant="primary" onclick={() => create(close)}>Create suite</Button>{/snippet}
      </Dialog>
      <p class="field-desc" role="status">{suiteFeedback}</p>
    </div>
  </div>
  <div class="od-stack" style="margin-top:16px">
    <p class="field-legend">Confirmation</p>
    <div class="od-cluster">
      <ConfirmDialog trigger="Pair sample device" title="Pair with this device?" description="This will allow the device to connect and share data with your current session." action="Connect"
        onConfirm={() => { connected = true; pairFeedback = 'Sample device · connected locally'; }}
        onResult={result => { if (result === 'canceled') pairFeedback = connected ? 'Pairing canceled. Existing local connection retained.' : 'Pairing canceled. Sample device not connected.'; }}/>
      <p class="field-desc" role="status">{pairFeedback}</p>
    </div>
    <p class="field-desc">Local interaction examples. Cancel, Escape or the scrim dismisses; only the action confirms. The mosaic stays static with reduced motion.</p>
  </div>
</section>