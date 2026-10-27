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
  import {
    DEFAULT_AZURE_OCR_API_VERSION,
    DEFAULT_PROVIDER_TYPE,
    PROVIDER_SELECT_ITEMS,
    isSavableProvider,
    providerByType
  } from './providers.js';

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

  const saving = $derived(connectorStore.saving);
  const fieldsDisabled = $derived(saving);
  const savableProvider = $derived(record ? isSavableProvider(record.providerType) : false);
  const saveUnavailable = $derived(record !== null && !savableProvider);
  const isAzureOcr = $derived(record?.providerType === 'azure_document_intelligence');
  const showModels = $derived(
    !isAzureOcr
    && ((record?.catalogState ?? 'idle') !== 'idle' || (record?.models?.length ?? 0) > 0)
  );

  /** @param {'name' | 'baseUrl' | 'credential' | 'credentialLabel'} field */
  function fieldError(field) {
    return connectorStore.saveErrorField === field ? connectorStore.saveError : '';
  }

  const generalSaveError = $derived(
    connectorStore.saveError && !connectorStore.saveErrorField ? connectorStore.saveError : ''
  );

  const apiKeyDescription = $derived(
    !record
      ? ''
      : record.providerType === 'web_request'
        ? 'Optional for public endpoints.'
        : isAzureOcr
          ? 'Required for Azure Document Intelligence.'
          : ''
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
          description="Nothing is stored until you Save."
          icon={provider.icon}
          close
        />
        <DialogBody>
          <p id="connector-dialog-desc" class="sr-only">
            Configure an LLM or HTTP Connector. Choose Save to store the Connector; Cancel
            discards the draft.
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
            {#if isAzureOcr}
              <Input
                label="API version"
                inlineMessage
                value={record.apiVersion || DEFAULT_AZURE_OCR_API_VERSION}
                oninput={(/** @type {Event} */ e) => fieldInput('apiVersion', e)}
                autocomplete="off"
                spellcheck="false"
                disabled={fieldsDisabled}
                description="Azure Document Intelligence REST API version."
              />
            {/if}
            <Input
              label="API Key"
              inlineMessage
              value={record.apiKey}
              oninput={(/** @type {Event} */ e) => fieldInput('apiKey', e)}
              type="password"
              autocomplete="off"
              placeholder={record.providerType === 'web_request' ? 'Optional' : 'Paste your key'}
              description={record.providerType === 'web_request' ? 'Optional for public endpoints.' : isAzureOcr ? 'Required for Azure Document Intelligence.' : ''}
              disabled={fieldsDisabled}
              error={fieldError('credential')}
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
                Saving is not available for {provider.label} yet; the model preview below stays simulated.
              </p>
            {/if}
            {#if generalSaveError}
              <p class="connector-connection-error" role="alert">{generalSaveError}</p>
            {/if}
          </div>
        </DialogBody>
        <div class="modal-foot connector-dialog-foot">
          {#if !isAzureOcr}
            <div class="connector-test-wrap">
              <Button type="button" disabled={record.catalogState === 'loading' || fieldsDisabled} onclick={() => previewDraftModels()}>
                Preview models
              </Button>
            </div>
          {/if}
          <div class="modal-foot-actions connector-dialog-actions">
            <Button type="button" onclick={closeDialog}>Cancel</Button>
            <LoadingButton
              type="button"
              variant="primary"
              busy={saving}
              idle="Save"
              working="Saving…"
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

  .connector-save-note {
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
