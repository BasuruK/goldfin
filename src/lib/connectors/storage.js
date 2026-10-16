import { DEFAULT_PROVIDER_TYPE } from './providers.js';

/**
 * Legacy on-device Connector storage (pre-worker UI). Nothing reads these records
 * as Connectors anymore (ADR 0012): the key is only detected so the page can offer
 * the explicit reset, and cleared by that action. Drafts below live in memory only.
 */
const STORAGE_KEY = 'goldfin.connectors.v1';

/**
 * @typedef {import('./providers.js').ProviderType} ProviderType
 *
 * In-memory Connector draft for the dialog. `apiKey` holds the draft Credential and
 * exists only until Save sends it to the API; it is never persisted (ADR 0005).
 *
 * @typedef {{
 *   id: string,
 *   providerType: ProviderType,
 *   name: string,
 *   baseUrl: string,
 *   apiKey: string,
 *   credentialLabel: string,
 *   connectionStatus: 'idle' | 'testing' | 'ok' | 'failed',
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

/** @returns {boolean} */
export function hasLegacyData() {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** @returns {boolean} whether storage was available to clear */
export function clearLegacyData() {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {ProviderType} providerType
 * @returns {ConnectorRecord}
 */
export function createEmptyConnector(providerType = DEFAULT_PROVIDER_TYPE) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    providerType,
    name: '',
    baseUrl: '',
    apiKey: '',
    credentialLabel: '',
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
