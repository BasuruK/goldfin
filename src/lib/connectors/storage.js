const STORAGE_KEY = 'goldfin.connectors.v1';

/**
 * @typedef {import('./providers.js').ProviderType} ProviderType
 * @typedef {import('./connection-check.js').ConnectionStatus} ConnectionStatus
 *
 * @typedef {{
 *   id: string,
 *   providerType: ProviderType,
 *   name: string,
 *   baseUrl: string,
 *   apiKey: string,
 *   connectionStatus: ConnectionStatus,
 *   connectionMessage: string,
 *   lastCheckedAt: string | null,
 *   updatedAt: string,
 *   models: { id: string, enabled: boolean, source: 'sample' | 'manual' | 'discovered', verified?: boolean }[],
 *   catalogState: 'idle' | 'loading' | 'ready' | 'unsupported' | 'failed',
 *   catalogMessage: string,
 *   discoveryRevision: number
 * }} ConnectorRecord
 */

/** @returns {ConnectorRecord[]} */
export function loadConnectors() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

/** @param {ProviderType} providerType */
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
    lastCheckedAt: null,
    models: [],
    catalogState: 'idle',
    catalogMessage: '',
    discoveryRevision: 0,
    updatedAt: now
  };
}
