import { DEFAULT_PROVIDER_TYPE } from '../../src/lib/connectors/providers.js';
import { createEmptyConnector } from '../../src/lib/connectors/storage.js';

/** @param {Partial<import('../../src/lib/connectors/storage.js').ConnectorRecord>} [overrides] */
export function makeRecord(overrides = {}) {
  return { ...createEmptyConnector(DEFAULT_PROVIDER_TYPE), ...overrides };
}
