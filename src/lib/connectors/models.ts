import type { ConnectorModel, ConnectorRecord } from './storage.ts';

export type { ConnectorRecord };

export type CatalogResult =
  | { state: 'unsupported' | 'failed'; message?: string }
  | { state?: 'ready'; ids: string[]; source: ConnectorModel['source']; message?: string };

export function isCatalogEditable(record: { catalogState: string }): boolean {
  return ['ready', 'unsupported'].includes(record.catalogState);
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
    models: (record.models ?? []).map(model => ({ ...model, verified: false })),
    discoveryRevision: (record.discoveryRevision ?? 0) + 1
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

export function beginDiscovery(record: ConnectorRecord): ConnectorRecord {
  return {
    ...record,
    catalogState: 'loading',
    catalogMessage: '',
    discoveryRevision: (record.discoveryRevision ?? 0) + 1
  };
}

export function finishDiscovery(
  record: ConnectorRecord,
  revision: number,
  result: CatalogResult
): ConnectorRecord {
  if (record.discoveryRevision !== revision) return record;
  if (!('ids' in result)) {
    return { ...record, catalogState: result.state, catalogMessage: result.message ?? '' };
  }
  const previous = new Map((record.models ?? []).map(model => [model.id, model.enabled]));
  const models: ConnectorModel[] = [...new Set(result.ids)].map(id => ({
    id,
    enabled: previous.get(id) ?? false,
    source: result.source
  }));
  const discoveredIds = new Set(result.ids);
  const customModels = (record.models ?? []).filter(
    model => model.source === 'manual' && !discoveredIds.has(model.id)
  );
  models.push(...customModels);
  return { ...record, models, catalogState: 'ready', catalogMessage: result.message ?? '' };
}

export function addManualModel(record: ConnectorRecord, value: string): ConnectorRecord {
  const id = value.trim();
  if (!id || (record.models ?? []).some(model => model.id === id)) return record;
  return {
    ...record,
    models: [...(record.models ?? []), { id, enabled: false, source: 'manual' }]
  };
}
