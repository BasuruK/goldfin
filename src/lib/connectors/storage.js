import { DEFAULT_PROVIDER_TYPE } from './providers.js';

/**
 * Key of the pre-API on-device Connector store, which held plaintext Credentials.
 * Nothing reads it; it is only cleared (ADR 0013). Drafts below live in memory only.
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
 *   apiVersion: string,
 *   updatedAt: string,
 *   models: { id: string, enabled: boolean, source: 'sample' | 'manual' | 'discovered', verified?: boolean }[],
 *   catalogState: 'idle' | 'loading' | 'ready' | 'unsupported' | 'failed',
 *   catalogMessage: string,
 *   discoveryRevision: number
 * }} ConnectorRecord
 */

/** Clears the legacy store on every load; the Credentials in it must not stay at rest. */
export function clearLegacyConnectors() {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage is unavailable, so there is nothing to clear.
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
    apiVersion: '',
    models: [],
    catalogState: 'idle',
    catalogMessage: '',
    discoveryRevision: 0,
    updatedAt: now
  };
}
