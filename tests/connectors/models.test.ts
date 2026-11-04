import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyConnectorPatch,
  availableModelIds,
  addManualModel,
  canToggleModel,
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
    catalogMessage: 'Found 1 model.',
    models: [{ id: 'model-a', enabled: true, source: 'discovered', verified: true }]
  });
  assert.deepEqual(availableModelIds(record), ['model-a']);
  const patchesDisableEnabled: Partial<ConnectorRecord>[] = [
    { baseUrl: 'https://other.example/v1' },
    { providerType: 'openai_compatible' }
  ];
  for (const patch of patchesDisableEnabled) {
    const changed = applyConnectorPatch(record, patch);
    assert.equal(changed.catalogState, 'idle');
    assert.deepEqual(availableModelIds(changed), []);
    assert.equal(changed.models[0]?.enabled, false);
  }
  const patchesKeepEnabled: Partial<ConnectorRecord>[] = [
    { apiKey: 'changed' },
    { llmApiMode: 'chat_completions' },
    { apiVersion: '2024-11-30' }
  ];
  for (const patch of patchesKeepEnabled) {
    const changed = applyConnectorPatch(record, patch);
    assert.equal(changed.catalogState, 'idle');
    assert.deepEqual(availableModelIds(changed), []);
    assert.equal(changed.models[0]?.enabled, true);
    assert.equal(changed.models[0].verified, false);
    assert.equal(changed.catalogMessage, '');
  }
  assert.deepEqual(availableModelIds(applyConnectorPatch(record, { name: 'Renamed' })), ['model-a']);
});

test('repeating the current connection details keeps the catalog and its selections', () => {
  const record = makeRecord({
    providerType: 'openai',
    baseUrl: 'https://example.com/v1',
    catalogState: 'ready',
    models: [{ id: 'model-a', enabled: true, source: 'discovered', verified: true }]
  });
  const same = { providerType: record.providerType, baseUrl: record.baseUrl };
  assert.equal(applyConnectorPatch(record, same).catalogState, 'ready');
  const keyChanged = applyConnectorPatch(record, { ...same, apiKey: 'changed' });
  assert.equal(keyChanged.catalogState, 'idle');
  assert.equal(keyChanged.models[0]?.enabled, true);
});

test('manual models are selectable when enabled without verification', () => {
  const manual = addManualModel(makeRecord({ catalogState: 'ready' }), ' deployment-a ');
  assert.deepEqual(manual.models, [{ id: 'deployment-a', enabled: false, source: 'manual' }]);
  assert.deepEqual(availableModelIds(manual), []);
  const enabled = {
    ...manual,
    models: [{ id: 'deployment-a', enabled: true, source: 'manual' as const }]
  };
  assert.deepEqual(availableModelIds(enabled), ['deployment-a']);
});

test('a blank model ID changes nothing and a new ID is appended', () => {
  const record = makeRecord({ models: [{ id: 'deployment-a', enabled: true, source: 'manual' }] });
  assert.equal(addManualModel(record, '   '), record);
  assert.deepEqual(addManualModel(record, 'deployment-b').models.map(model => model.id), ['deployment-a', 'deployment-b']);
});

test('discovered models still require verification', () => {
  const record = makeRecord({ catalogState: 'ready', models: [{ id: 'model-a', enabled: true, source: 'discovered' }] });
  assert.deepEqual(availableModelIds(record), []);
  const [model] = record.models;
  assert.ok(model);
  model.verified = true;
  assert.deepEqual(availableModelIds(record), ['model-a']);
});

test('re-entering an existing model ID restores catalog readiness without reviving verification', () => {
  const record = makeRecord({
    catalogState: 'idle',
    models: [{ id: 'deployment-a', enabled: true, source: 'manual', verified: false }]
  });
  assert.equal(isCatalogEditable(record), false);
  const restored = addManualModel(record, 'deployment-a');
  assert.equal(restored.catalogState, 'ready');
  assert.equal(isCatalogEditable(restored), true);
  assert.equal(restored.models[0]?.verified, false);
  assert.equal(restored.models[0].enabled, true);
  assert.equal(addManualModel(restored, 'deployment-a'), restored);
});

test('manual model toggles stay enabled when connection edits idle the catalog', () => {
  const record = makeRecord({
    apiKey: 'test',
    catalogState: 'idle',
    models: [{ id: 'deployment-a', enabled: false, source: 'manual' }]
  });
  assert.equal(isCatalogEditable(record), false);
  const [manualModel] = record.models;
  assert.ok(manualModel);
  assert.equal(canToggleModel(record, manualModel), true);
  const discovered = makeRecord({
    catalogState: 'idle',
    models: [{ id: 'model-a', enabled: true, source: 'discovered', verified: true }]
  });
  const [discoveredModel] = discovered.models;
  assert.ok(discoveredModel);
  assert.equal(canToggleModel(discovered, discoveredModel), false);
});

test('manual IDs lose availability on connection changes until re-enabled', () => {
  const record = makeRecord({
    apiKey: 'test',
    catalogState: 'ready',
    models: [{ id: 'deployment-a', enabled: true, source: 'manual' }]
  });
  assert.deepEqual(availableModelIds(record), ['deployment-a']);
  const changed = applyConnectorPatch(record, { apiKey: 'changed' });
  assert.equal(changed.catalogState, 'idle');
  assert.deepEqual(availableModelIds(changed), []);
});
