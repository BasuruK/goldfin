import { isProviderType } from './providers.js';

const STORAGE_KEY = 'goldfin.connectors.v1';

/**
 * @typedef {import('./providers.js').ProviderType} ProviderType
 * @typedef {import('./connection-check.js').ConnectionStatus} ConnectionStatus
 *
 * Persisted Connector list for the v1 client-only UI. `apiKey` is stored in plaintext
 * in `localStorage` on this device until worker-backed Credential storage ships (ADR 0005).
 *
 * @typedef {{
 *   id: string,
 *   providerType: ProviderType,
 *   name: string,
 *   baseUrl: string,
 *   apiKey: string,
 *   connectionStatus: ConnectionStatus,
 *   connectionMessage: string,
 *   checkRequestId: string | null,
 *   lastCheckedAt: string | null,
 *   updatedAt: string,
 *   models: { id: string, enabled: boolean, source: 'sample' | 'manual' | 'discovered', verified?: boolean }[],
 *   catalogState: 'idle' | 'loading' | 'ready' | 'unsupported' | 'failed',
 *   catalogMessage: string,
 *   discoveryRevision: number
 * }} ConnectorRecord
 */

/** @param {unknown} raw */
function normalizeConnector(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const entry = /** @type {Record<string, unknown>} */ (raw);
  if (typeof entry.id !== 'string' || !entry.id) return null;

  const providerType = isProviderType(entry.providerType) ? entry.providerType : 'openai';

  /** @type {ConnectionStatus} */
  let connectionStatus =
    entry.connectionStatus === 'ok' || entry.connectionStatus === 'failed' ? entry.connectionStatus : 'idle';
  if (entry.connectionStatus === 'testing') connectionStatus = 'idle';

  /** @type {ConnectorRecord['catalogState']} */
  let catalogState = 'idle';
  if (
    entry.catalogState === 'ready' ||
    entry.catalogState === 'unsupported' ||
    entry.catalogState === 'failed'
  ) {
    catalogState = entry.catalogState;
  }

  const models = Array.isArray(entry.models)
    ? entry.models
        .filter(
          model =>
            model &&
            typeof model === 'object' &&
            typeof model.id === 'string' &&
            model.id &&
            (model.source === 'sample' || model.source === 'manual' || model.source === 'discovered')
        )
        .map(model => ({
          id: model.id,
          enabled: Boolean(model.enabled),
          source: model.source,
          ...(model.verified === true ? { verified: true } : {})
        }))
    : [];

  return {
    id: entry.id,
    providerType,
    name: typeof entry.name === 'string' ? entry.name : '',
    baseUrl: typeof entry.baseUrl === 'string' ? entry.baseUrl : '',
    apiKey: typeof entry.apiKey === 'string' ? entry.apiKey : '',
    connectionStatus,
    connectionMessage: typeof entry.connectionMessage === 'string' ? entry.connectionMessage : '',
    checkRequestId: null,
    lastCheckedAt: typeof entry.lastCheckedAt === 'string' ? entry.lastCheckedAt : null,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : new Date().toISOString(),
    models,
    catalogState,
    catalogMessage: typeof entry.catalogMessage === 'string' ? entry.catalogMessage : '',
    discoveryRevision: typeof entry.discoveryRevision === 'number' ? entry.discoveryRevision : 0
  };
}

/** @returns {ConnectorRecord[]} */
export function loadConnectors() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeConnector).filter(record => record !== null);
  } catch {
    return [];
  }
}

/** @param {ConnectorRecord[]} connectors */
export function saveConnectors(connectors) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connectors));
  } catch (error) {
    console.warn('Failed to persist connectors to localStorage', error);
  }
}

/**
 * @param {ProviderType} providerType
 * @returns {ConnectorRecord}
 */
export function createEmptyConnector(providerType) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    providerType,
    name: '',
    baseUrl: '',
    apiKey: '',
    connectionStatus: 'idle',
    connectionMessage: '',
    checkRequestId: null,
    lastCheckedAt: null,
    models: [],
    catalogState: 'idle',
    catalogMessage: '',
    discoveryRevision: 0,
    updatedAt: now
  };
}
