import type { ConnectorModel, ConnectorRecord } from './storage.ts';

export type { ConnectorRecord };

export function isCatalogEditable(record: { catalogState: string }): boolean {
  return record.catalogState === 'ready';
}

export function applyConnectorPatch(record: ConnectorRecord, patch: Partial<ConnectorRecord>): ConnectorRecord {
  const connectionFields: (keyof ConnectorRecord)[] = ['providerType', 'baseUrl', 'apiKey', 'apiVersion'];
  const changed = connectionFields.some(
    field => field in patch && patch[field] !== record[field]
  );
  if (!changed) return { ...record, ...patch };
  return {
    ...record,
    ...patch,
    catalogState: 'idle',
    catalogMessage: '',
    models: (record.models ?? []).map(model => ({ ...model, verified: false }))
  };
}

export function availableModelIds(record: ConnectorRecord): string[] {
  if (!isCatalogEditable(record)) return [];
  return (record.models ?? [])
    .filter(
      model =>
        model.enabled && ['discovered', 'manual'].includes(model.source) && model.verified === true
    )
    .map(model => model.id);
}

export function addManualModel(record: ConnectorRecord, value: string): ConnectorRecord {
  const id = value.trim();
  if (!id || (record.models ?? []).some(model => model.id === id)) return record;
  return {
    ...record,
    catalogState: 'ready',
    models: [...(record.models ?? []), { id, enabled: false, source: 'manual' }]
  };
}
