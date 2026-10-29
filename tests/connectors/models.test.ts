import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyConnectorPatch,
  availableModelIds,
  addManualModel,
  isCatalogEditable
} from '../../src/lib/connectors/models.ts';
import { makeRecord } from './fixtures.ts';
import type { ConnectorRecord } from '../../src/lib/connectors/storage.ts';

test('isCatalogEditable matches ready only', () => {
  assert.equal(isCatalogEditable({ catalogState: 'ready' }), true);
  assert.equal(isCatalogEditable({ catalogState: 'idle' }), false);
});

test('changing connection details blocks model use but retains selections', () => {
  const record = makeRecord({
    providerType: 'openai',
    baseUrl: 'https://example.com/v1',
    apiKey: 'test',
    catalogState: 'ready',
    models: [{ id: 'model-a', enabled: true, source: 'discovered', verified: true }]
  });
  assert.deepEqual(availableModelIds(record), ['model-a']);
  const patches: Partial<ConnectorRecord>[] = [
    { baseUrl: 'https://other.example/v1' },
    { apiKey: 'changed' },
    { apiVersion: '2024-11-30' },
    { providerType: 'azure' }
  ];
  for (const patch of patches) {
    const changed = applyConnectorPatch(record, patch);
    assert.equal(changed.catalogState, 'idle');
    assert.deepEqual(availableModelIds(changed), []);
    assert.equal(changed.models[0].enabled, true);
  }
  assert.deepEqual(availableModelIds(applyConnectorPatch(record, { name: 'Renamed' })), ['model-a']);
});

test('manual models never claim verified system access', () => {
  const manual = addManualModel(makeRecord({ catalogState: 'ready' }), ' deployment-a ');
  assert.deepEqual(manual.models, [{ id: 'deployment-a', enabled: false, source: 'manual' }]);
  assert.equal(addManualModel(manual, 'deployment-a'), manual);
  assert.equal(addManualModel(manual, '  '), manual);
  manual.models[0].enabled = true;
  assert.deepEqual(availableModelIds(manual), []);
});

test('being listed by a provider does not prove model access', () => {
  const record = makeRecord({ catalogState: 'ready', models: [{ id: 'model-a', enabled: true, source: 'discovered' }] });
  assert.deepEqual(availableModelIds(record), []);
  record.models[0].verified = true;
  assert.deepEqual(availableModelIds(record), ['model-a']);
});

test('manual IDs become available only after verification and lose access on connection changes', () => {
  const record = makeRecord({
    apiKey: 'test',
    catalogState: 'ready',
    models: [{ id: 'deployment-a', enabled: true, source: 'manual', verified: true }]
  });
  assert.deepEqual(availableModelIds(record), ['deployment-a']);
  const changed = applyConnectorPatch(record, { apiKey: 'changed' });
  assert.equal(changed.catalogState, 'idle');
  assert.equal(changed.models[0].verified, false);
  assert.deepEqual(availableModelIds(changed), []);
});
