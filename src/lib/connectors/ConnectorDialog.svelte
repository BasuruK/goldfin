<script>
  import { Dialog as Primitive } from 'bits-ui';
  import {
    DialogBody,
    Button,
    LoadingButton,
    DialogHeader,
    Input,
    Select
  } from '$goldfin/lib/index.js';
  import ModelPanel from './ModelPanel.svelte';
  import {
    closeDialog,
    connectorStore,
    patchDraft,
    previewDraftModels,
    saveDraft,
    setDraftProviderType
  } from './store.svelte.js';
  import { DEFAULT_PROVIDER_TYPE, PROVIDER_SELECT_ITEMS, providerByType } from './providers.js';

  const record = $derived(connectorStore.draft);
  const provider = $derived(record ? providerByType(record.providerType) : null);

  /** @type {import('./providers.js').ProviderType} */
  let providerType = $state(DEFAULT_PROVIDER_TYPE);

  $effect(() => {
    if (record) providerType = record.providerType;
  });

  $effect(() => {
    if (!record || providerType === record.providerType) return;
    setDraftProviderType(providerType);
  });

  /** @param {boolean} next */
  function onOpenChange(next) {
    if (!next) closeDialog();
  }

  /** @param {string} field @param {Event} event */
  function fieldInput(field, event) {
    if (!record) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    patchDraft({ [field]: target.value });
  }

  const saving = $derived(connectorStore.saveState === 'queued' || connectorStore.saveState === 'running');
  const fieldsDisabled = $derived(saving);
  const saveUnavailable = $derived(record !== null && record.providerType !== 'web_request');
  const showModels = $derived(
    (record?.catalogState ?? 'idle') !== 'idle' || (record?.models?.length ?? 0) > 0
  );

  const saveStatus = $derived.by(() => {
    if (connectorStore.saveState === 'queued') return 'Queued — waiting for a worker to run the check…';
    if (connectorStore.saveState === 'running') return 'Checking — the worker is calling the endpoint…';
    return '';
  });

  /** @param {'name' | 'baseUrl' | 'credentialLabel'} field */
  function fieldError(field) {
    return connectorStore.saveErrorField === field ? connectorStore.saveError : '';
  }

  const generalSaveError = $derived(
    connectorStore.saveError && !connectorStore.saveErrorField ? connectorStore.saveError : ''
  );
</script>

<Primitive.Root open={connectorStore.dialogOpen} onOpenChange={onOpenChange}>
  <Primitive.Portal>
    <Primitive.Overlay class="gf-overlay" />
    {#if record && provider}
      <Primitive.Content class={showModels ? 'gf-modal connector-dialog with-models' : 'gf-modal connector-dialog'} aria-describedby="connector-dialog-desc">
        <div class="modal connector-form-panel">
        <DialogHeader
          parts={Primitive}
          title={record.name?.trim() ? record.name : `Connect to ${provider.label}`}
          description="Nothing is stored until you Save and a worker check succeeds."
          icon={provider.icon}
          close
        />
        <DialogBody>
          <p id="connector-dialog-desc" class="sr-only">
            Configure an LLM or HTTP Connector. Choose Save to stage the Connector for a worker
            check; Cancel discards the draft.
          </p>
          <div class="connector-form">
            <Select label="Provider" items={PROVIDER_SELECT_ITEMS} bind:value={providerType} disabled={fieldsDisabled} />
            <Input
              label="Name"
              value={record.name}
              oninput={(/** @type {Event} */ e) => fieldInput('name', e)}
              placeholder={provider.label}
              disabled={fieldsDisabled}
              error={fieldError('name')}
            />
            <Input
              label="Base URL"
              inlineMessage
              value={record.baseUrl}
              oninput={(/** @type {Event} */ e) => fieldInput('baseUrl', e)}
              type="url"
              autocomplete="off"
              spellcheck="false"
              disabled={fieldsDisabled}
              error={fieldError('baseUrl')}
            />
            <Input
              label="API Key"
              inlineMessage
              value={record.apiKey}
              oninput={(/** @type {Event} */ e) => fieldInput('apiKey', e)}
              type="password"
              autocomplete="off"
              placeholder={record.providerType === 'web_request' ? 'Optional' : 'sk-…'}
              description={record.providerType === 'web_request' ? 'Optional for public endpoints.' : ''}
              disabled={fieldsDisabled}
            />
            {#if record.apiKey}
              <Input
                label="Credential label"
                inlineMessage
                value={record.credentialLabel}
                oninput={(/** @type {Event} */ e) => fieldInput('credentialLabel', e)}
                autocomplete="off"
                placeholder="e.g. Production key"
                disabled={fieldsDisabled}
                error={fieldError('credentialLabel')}
              />
            {/if}
            {#if saveUnavailable}
              <p class="connector-save-note">
                Saving is not available for {provider.label} yet. Only Web Request Connectors can
                be saved; the model preview below stays simulated.
              </p>
            {/if}
            {#if saveStatus}
              <p class="connector-save-status" role="status">{saveStatus}</p>
            {/if}
            {#if generalSaveError}
              <p class="connector-connection-error" role="alert">{generalSaveError}</p>
            {/if}
          </div>
        </DialogBody>
        <div class="modal-foot connector-dialog-foot">
          <div class="connector-test-wrap">
            <Button type="button" disabled={record.catalogState === 'loading' || fieldsDisabled} onclick={() => previewDraftModels()}>
              Preview models
            </Button>
          </div>
          <div class="modal-foot-actions connector-dialog-actions">
            <Button type="button" onclick={closeDialog}>Cancel</Button>
            <LoadingButton
              type="button"
              variant="primary"
              busy={saving}
              idle="Save"
              working={connectorStore.saveState === 'queued' ? 'Queued…' : 'Checking…'}
              disabled={saveUnavailable}
              onclick={() => saveDraft()}
            >
              Save
            </LoadingButton>
          </div>
        </div>
        </div>
        {#if showModels}<ModelPanel {record} />{/if}
      </Primitive.Content>
    {/if}
  </Primitive.Portal>
</Primitive.Root>

<style>
  :global(.connector-dialog) {
    --connector-width: min(816px, calc(100vw - 32px));
    inline-size: var(--connector-width);
    max-block-size: calc(100dvh - 32px);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    scrollbar-color: var(--ufg3) var(--uwell);
  }
  .connector-form-panel {
    flex: 1 1 440px;
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    max-inline-size: 440px;
    max-height: none;
    transform: translateX(calc((var(--connector-width) - min(440px, calc(100vw - 32px))) / 2));
  }
  :global(.connector-dialog.with-models) .connector-form-panel { max-inline-size: none; transform: translateX(0); }
  @media (prefers-reduced-motion: no-preference) {
    .connector-form-panel { transition: transform var(--duration-menu) var(--ease-out); }
  }
  :global(.connector-dialog .modal-icon) {
    background: var(--uprim);
    color: var(--uprimfg);
  }

  :global(.connector-dialog .modal-body) {
    padding-block-end: 16px;
  }

  .connector-form {
    display: grid;
    gap: 16px;
  }

  .connector-connection-error {
    margin: 0;
    font: 500 13px Urbanist, system-ui, sans-serif;
    color: var(--bad, #e85d5d);
  }

  .connector-save-note,
  .connector-save-status {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--ufg2);
  }

  .connector-dialog-foot {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px 16px;
    padding-block: 14px 16px;
  }

  .connector-test-wrap {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .connector-test-wrap :global(.btn) {
    min-inline-size: 4.75rem;
  }

  .connector-dialog-actions {
    flex: none;
    margin-inline-start: auto;
  }

  .sr-only {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
