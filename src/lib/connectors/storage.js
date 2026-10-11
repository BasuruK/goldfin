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
 *   updatedAt: string
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connectors));
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
    updatedAt: now
  };
}
