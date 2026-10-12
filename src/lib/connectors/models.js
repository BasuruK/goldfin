/** @param {{ catalogState: string }} record */
export function isCatalogEditable(record) {
  return ['ready', 'unsupported'].includes(record.catalogState);
}

export function applyConnectorPatch(record, patch) {
  const changed = ['providerType', 'baseUrl', 'apiKey'].some(
    field => field in patch && patch[field] !== record[field]
  );
  if (!changed) return { ...record, ...patch };
  return {
    ...record, ...patch,
    connectionStatus: 'idle', connectionMessage: '', lastCheckedAt: null, checkRequestId: null,
    catalogState: 'idle', catalogMessage: '',
    models: (record.models ?? []).map(model => ({ ...model, verified: false })),
    discoveryRevision: (record.discoveryRevision ?? 0) + 1
  };
}

export function availableModelIds(record) {
  if (!isCatalogEditable(record)) return [];
  return (record.models ?? [])
    .filter(model => model.enabled && ['discovered', 'manual'].includes(model.source) && model.verified === true)
    .map(model => model.id);
}

export function beginDiscovery(record) {
  return {
    ...record, catalogState: 'loading', catalogMessage: '',
    discoveryRevision: (record.discoveryRevision ?? 0) + 1
  };
}

export function finishDiscovery(record, revision, result) {
  if (record.discoveryRevision !== revision) return record;
  const state = result.state ?? 'ready';
  if (state !== 'ready') {
    return { ...record, catalogState: state, catalogMessage: result.message ?? '' };
  }
  const previous = new Map((record.models ?? []).map(model => [model.id, model.enabled]));
  const models = [...new Set(result.ids)].map(id => ({
    id, enabled: previous.get(id) ?? false, source: result.source
  }));
  const discoveredIds = new Set(result.ids);
  const customModels = (record.models ?? []).filter(
    model => model.source === 'manual' && !discoveredIds.has(model.id)
  );
  models.push(...customModels);
  return { ...record, models, catalogState: 'ready', catalogMessage: result.message ?? '' };
}

export function addManualModel(record, value) {
  const id = value.trim();
  if (!id || (record.models ?? []).some(model => model.id === id)) return record;
  return {
    ...record,
    models: [...(record.models ?? []), { id, enabled: false, source: 'manual' }]
  };
}
