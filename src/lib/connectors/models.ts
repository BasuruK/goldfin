import type { ConnectorModel, ConnectorRecord } from './storage.ts';

export type { ConnectorRecord };

export function isCatalogEditable(record: { catalogState: string }): boolean {
  return record.catalogState === 'ready';
}

/** Manual model toggles stay available while connection edits leave the catalog idle. */
export function canToggleModel(record: ConnectorRecord, model: ConnectorModel): boolean {
  return model.source === 'manual' || isCatalogEditable(record);
}

export function applyConnectorPatch(record: ConnectorRecord, patch: Partial<ConnectorRecord>): ConnectorRecord {
  const providerChanged = 'providerType' in patch && patch.providerType !== record.providerType;
  const baseUrlChanged = 'baseUrl' in patch && patch.baseUrl !== record.baseUrl;
  const connectionFields: (keyof ConnectorRecord)[] = ['providerType', 'baseUrl', 'apiKey', 'apiVersion', 'llmApiMode'];
  const changed = connectionFields.some(
    field => field in patch && patch[field] !== record[field]
  );
  if (!changed) return { ...record, ...patch };
  const clearEnabledModels = providerChanged || baseUrlChanged;
  return {
    ...record,
    ...patch,
    catalogState: 'idle',
    catalogMessage: '',
    models: record.models.map(model => ({
      ...model,
      verified: false,
      enabled: clearEnabledModels ? false : model.enabled
    }))
  };
}

export function availableModelIds(record: ConnectorRecord): string[] {
  if (!isCatalogEditable(record)) return [];
  return record.models
    .filter(model => {
      if (!model.enabled) return false;
      if (model.source === 'manual') return true;
      return model.verified === true;
    })
    .map(model => model.id);
}

export function addManualModel(record: ConnectorRecord, value: string): ConnectorRecord {
  const id = value.trim();
  if (!id) return record;
  if (record.models.some(model => model.id === id)) {
    return record.catalogState === 'ready' ? record : { ...record, catalogState: 'ready' };
  }
  return {
    ...record,
    catalogState: 'ready',
    models: [...record.models, { id, enabled: false, source: 'manual' }]
  };
}
