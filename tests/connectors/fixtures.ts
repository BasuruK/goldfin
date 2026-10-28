import { DEFAULT_PROVIDER_TYPE } from '../../src/lib/connectors/providers.ts';
import { createEmptyConnector, type ConnectorRecord } from '../../src/lib/connectors/storage.ts';

export function makeRecord(overrides: Partial<ConnectorRecord> = {}): ConnectorRecord {
  return { ...createEmptyConnector(DEFAULT_PROVIDER_TYPE), ...overrides };
}
