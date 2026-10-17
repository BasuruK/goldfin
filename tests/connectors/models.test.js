import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyConnectorPatch,
  availableModelIds,
  beginDiscovery,
  finishDiscovery,
  addManualModel,
  isCatalogEditable
} from '../../src/lib/connectors/models.js';
import { makeRecord } from './fixtures.js';

/** @typedef {import('../../src/lib/connectors/storage.js').ConnectorRecord} ConnectorRecord */

test('isCatalogEditable matches ready and unsupported only', () => {
  assert.equal(isCatalogEditable({ catalogState: 'ready' }), true);
  assert.equal(isCatalogEditable({ catalogState: 'unsupported' }), true);
  assert.equal(isCatalogEditable({ catalogState: 'idle' }), false);
});

test('changing connection details blocks model use but retains selections for refresh', () => {
  const record = makeRecord({
    providerType: 'openai', baseUrl: 'https://example.com/v1', apiKey: 'test',
    connectionStatus: 'ok', checkRequestId: 'pending', catalogState: 'ready', discoveryRevision: 1,
    models: [{ id: 'model-a', enabled: true, source: 'discovered', verified: true }]
  });
  assert.deepEqual(availableModelIds(record), ['model-a']);
  /** @type {Partial<ConnectorRecord>[]} */
  const patches = [{ baseUrl: 'https://other.example/v1' }, { apiKey: 'changed' }, { providerType: 'azure' }];
  for (const patch of patches) {
    const changed = applyConnectorPatch(record, patch);
    assert.equal(changed.catalogState, 'idle');
    assert.equal(changed.connectionStatus, 'idle');
    assert.equal(changed.checkRequestId, null);
    assert.equal(changed.discoveryRevision, 2);
    assert.deepEqual(availableModelIds(changed), []);
    assert.equal(changed.models[0].enabled, true);
  }
  assert.deepEqual(availableModelIds(applyConnectorPatch(record, { name: 'Renamed' })), ['model-a']);
});

test('refresh keeps matching selections and starts new models disabled', () => {
  const record = beginDiscovery(makeRecord({ models: [{ id: 'model-a', enabled: true, source: 'discovered' }] }));
  const refreshed = finishDiscovery(record, record.discoveryRevision, { ids: ['model-a', 'model-b', 'model-a'], source: 'discovered' });
  assert.deepEqual(refreshed.models, [
    { id: 'model-a', enabled: true, source: 'discovered' },
    { id: 'model-b', enabled: false, source: 'discovered' }
  ]);
  assert.deepEqual(availableModelIds(refreshed), []);
});

test('late discovery cannot replace a changed connection or a newer refresh', () => {
  const loading = beginDiscovery(makeRecord({ baseUrl: 'https://example.com' }));
  const changed = applyConnectorPatch(loading, { baseUrl: 'https://other.example' });
  assert.equal(finishDiscovery(changed, loading.discoveryRevision, { ids: ['old'], source: 'discovered' }), changed);
  const newer = beginDiscovery(loading);
  assert.equal(finishDiscovery(newer, loading.discoveryRevision, { ids: ['old'], source: 'discovered' }), newer);
});

test('sample and manual models never claim verified system access', () => {
  const loading = beginDiscovery(makeRecord());
  const sample = finishDiscovery(loading, loading.discoveryRevision, { ids: ['sample-chat'], source: 'sample' });
  sample.models[0].enabled = true;
  assert.deepEqual(availableModelIds(sample), []);
  const manual = addManualModel(makeRecord({ catalogState: 'unsupported' }), ' deployment-a ');
  assert.deepEqual(manual.models, [{ id: 'deployment-a', enabled: false, source: 'manual' }]);
  assert.equal(addManualModel(manual, 'deployment-a'), manual);
  assert.equal(addManualModel(manual, '  '), manual);
  manual.models[0].enabled = true;
  assert.deepEqual(availableModelIds(manual), []);
});

test('unsupported and failed discovery keep selections unavailable', () => {
  const loading = beginDiscovery(makeRecord({ models: [{ id: 'model-a', enabled: true, source: 'discovered' }] }));
  /** @type {('unsupported' | 'failed')[]} */
  const states = ['unsupported', 'failed'];
  for (const state of states) {
    const result = finishDiscovery(loading, loading.discoveryRevision, { state, message: 'Try again' });
    assert.equal(result.catalogState, state);
    assert.deepEqual(availableModelIds(result), []);
    assert.equal(result.models[0].enabled, true);
  }
});

test('being listed by a provider does not prove model access', () => {
  const record = makeRecord({ catalogState: 'ready', models: [{ id: 'model-a', enabled: true, source: 'discovered' }] });
  assert.deepEqual(availableModelIds(record), []);
  record.models[0].verified = true;
  assert.deepEqual(availableModelIds(record), ['model-a']);
});

test('manual IDs become available only after verification and lose access on connection changes', () => {
  const record = makeRecord({
    apiKey: 'test', catalogState: 'unsupported',
    models: [{ id: 'deployment-a', enabled: true, source: 'manual', verified: true }]
  });
  assert.deepEqual(availableModelIds(record), ['deployment-a']);
  const changed = applyConnectorPatch(record, { apiKey: 'changed' });
  assert.equal(changed.models[0].verified, false);
  const loading = beginDiscovery(changed);
  const refreshed = finishDiscovery(loading, loading.discoveryRevision, { state: 'unsupported' });
  assert.deepEqual(availableModelIds(refreshed), []);
});

test('custom model entry survives a catalog refresh', () => {
  const record = addManualModel(makeRecord({ catalogState: 'ready' }), 'my-custom-model');
  record.models[0].enabled = true;
  const loading = beginDiscovery(record);
  const refreshed = finishDiscovery(loading, loading.discoveryRevision, { ids: ['catalog-model'], source: 'sample' });
  assert.deepEqual(refreshed.models, [
    { id: 'catalog-model', enabled: false, source: 'sample' },
    { id: 'my-custom-model', enabled: true, source: 'manual' }
  ]);
  assert.deepEqual(availableModelIds(refreshed), []);
});
