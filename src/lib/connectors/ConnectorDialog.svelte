<script>
  import { Dialog as Primitive } from 'bits-ui';
  import {
    DialogBody,
    LoadingButton,
    DialogHeader,
    Icon,
    Input,
    Select
  } from '$goldfin/lib/index.js';
  import DeleteConnectorConfirm from './DeleteConnectorConfirm.svelte';
  import {
    closeDialog,
    connectorStore,
    editingConnector,
    patchConnector,
    removeDraftIfEmpty,
    setProviderType,
    testConnectorById
  } from './store.svelte.js';
  import { connectionFailureField } from './connection-check.js';
  import { PROVIDER_SELECT_ITEMS, providerByType } from './providers.js';

  const record = $derived(editingConnector());
  const provider = $derived(record ? providerByType(record.providerType) : null);

  let providerType = $state('openai');

  $effect(() => {
    if (record) providerType = record.providerType;
  });

  $effect(() => {
    if (!record || providerType === record.providerType) return;
    setProviderType(record.id, providerType);
  });

  function onOpenChange(next) {
    if (!next) {
      const id = connectorStore.editingId;
      closeDialog();
      if (id) removeDraftIfEmpty(id);
    }
  }

  /** @param {string} field @param {Event} event */
  function fieldInput(field, event) {
    if (!record) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;
    const patch = { [field]: target.value };
    if (field === 'baseUrl' || field === 'apiKey') {
      patch.connectionStatus = 'idle';
      patch.connectionMessage = '';
    }
    patchConnector(record.id, patch);
  }

  const testing = $derived(record?.connectionStatus === 'testing');

  const failedConnectionMessage = $derived(
    record?.connectionStatus === 'failed' && record.connectionMessage ? record.connectionMessage : ''
  );

  const baseUrlFieldError = $derived(
    failedConnectionMessage && connectionFailureField(failedConnectionMessage) === 'baseUrl'
      ? failedConnectionMessage
      : ''
  );

  const apiKeyFieldError = $derived(
    failedConnectionMessage && connectionFailureField(failedConnectionMessage) === 'apiKey'
      ? failedConnectionMessage
      : ''
  );

  const apiKeyFieldMessage = $derived.by(() => {
    if (!record?.connectionMessage) return '';
    if (record.connectionStatus === 'ok') {
      let msg = record.connectionMessage;
      if (record.lastCheckedAt) {
        msg += ` · ${new Date(record.lastCheckedAt).toLocaleTimeString()}`;
      }
      return msg;
    }
    if (record.connectionStatus === 'testing') return record.connectionMessage;
    return '';
  });
</script>

<Primitive.Root open={connectorStore.dialogOpen} onOpenChange={onOpenChange}>
  <Primitive.Portal>
    <Primitive.Overlay class="gf-overlay" />
    {#if record && provider}
      <Primitive.Content class="modal gf-modal connector-dialog" aria-describedby="connector-dialog-desc">
        <DialogHeader
          parts={Primitive}
          title={record.name.trim() ? record.name : `Connect to ${provider.label}`}
          description="API Key and base URL are saved as you type."
          icon={provider.icon}
          close
        >
          {#snippet actions()}
            <DeleteConnectorConfirm connector={record} iconTrigger trigger="Delete connector" />
          {/snippet}
        </DialogHeader>
        <DialogBody>
          <p id="connector-dialog-desc" class="sr-only">
            Configure an LLM or HTTP Connector. Values auto-save to this device.
          </p>
          <div class="connector-form">
            <Select label="Provider" items={PROVIDER_SELECT_ITEMS} bind:value={providerType} />
            <Input
              label="Name"
              value={record.name}
              oninput={e => fieldInput('name', e)}
              placeholder={provider.label}
            />
            <Input
              label="Base URL"
              inlineMessage
              value={record.baseUrl}
              oninput={e => fieldInput('baseUrl', e)}
              type="url"
              autocomplete="off"
              spellcheck="false"
              error={baseUrlFieldError}
            />
            <Input
              label="API Key"
              inlineMessage
              value={record.apiKey}
              oninput={e => fieldInput('apiKey', e)}
              type="password"
              autocomplete="off"
              placeholder={record.providerType === 'web_request' ? 'Optional' : 'sk-…'}
              description={record.providerType === 'web_request' ? 'Optional for public endpoints.' : ''}
              error={apiKeyFieldError}
              message={apiKeyFieldMessage}
            />
          </div>
        </DialogBody>
        <div class="modal-foot connector-dialog-foot">
          <div class="connector-test-wrap">
            <LoadingButton
              type="button"
              busy={testing}
              idle="Test"
              working="Testing…"
              onclick={() => testConnectorById(record.id)}
            >
              <Icon name="play" size={16} />
              Test
            </LoadingButton>
          </div>
          <div class="modal-foot-actions connector-dialog-actions">
            <Primitive.Close class="btn primary" type="button">Done</Primitive.Close>
            <Primitive.Close class="btn" type="button">Cancel</Primitive.Close>
          </div>
        </div>
      </Primitive.Content>
    {/if}
  </Primitive.Portal>
</Primitive.Root>

<style>
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

  .connector-dialog-foot {
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
    align-items: center;
    gap: 12px 16px;
    padding-block: 14px 16px;
  }

  .connector-test-wrap {
    flex: none;
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
