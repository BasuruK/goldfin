// PROTOTYPE — verifies the pure helpers in index.html. node --test
// The surface under test is deliberately small: URL refusal, redaction, and
// the generation lifecycle. Rendering is not tested and should not be.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const src = html.match(/<script>([\s\S]*)<\/script>/)[1]
  .split('/* ---------------- render ---------------- */')[0]
  .replace(/^/, 'globalThis.location={search:""};globalThis.document={getElementById:()=>null,addEventListener:()=>{}};\n');
(0, eval)(src + '\nfunction render() {}\nglobalThis.X = { urlCheck, scrub, logLine, runsUsing, rotate, tombstone, runTest, gen, activeGen, cred, conn, S, SECRET };');

const X = globalThis.X;
const g = id => X.gen('gateway-key', id);

test('a Connector URL must be absolute http(s)', () => {
  assert.equal(X.urlCheck('https://a.internal/v2').ok, true);
  assert.equal(X.urlCheck('ftp://a.internal/v2').ok, false);
  assert.equal(X.urlCheck('a.internal/v2').ok, false);
  assert.equal(X.urlCheck('').ok, false);
});

test('a credential-shaped query parameter is refused, an innocent one is not', () => {
  for (const u of [
    'https://a.internal/v2?api_key=sk-1',
    'https://a.internal/f?access_token=t',
    'https://a.internal/f?sig=s',
    'https://a.internal/f?key=1&o=2',
    'https://a.internal/f?subscription-key=k',
  ]) assert.equal(X.urlCheck(u).ok, false, u);
  assert.equal(X.urlCheck('https://a.internal/f?correlationId=q').ok, true);
});

test('redaction removes the value and nothing else', () => {
  const cases = [
    `[worker] headers {"X-Api-Key":"${X.SECRET}","Content-Type":"application/json"}`,
    `[worker] cURL error 28 for https://a.internal/v2?api_key=${X.SECRET}`,
    `[worker] GatewayException: upstream rejected (x-api-key=${X.SECRET}, attempt 3)`,
  ];
  for (const c of cases) {
    const s = X.scrub(c);
    assert.ok(!s.includes(X.SECRET), 'value still present: ' + s);
    assert.ok(s.includes('«redacted»'), 'no marker: ' + s);
    assert.equal((c.match(/,/g) || []).length, (s.match(/,/g) || []).length,
      'redaction ate a delimiter: ' + s);
  }
});

test('redaction is idempotent and leaves clean text alone', () => {
  assert.equal(X.scrub('[worker] outbound POST https://a.internal/v2'), '[worker] outbound POST https://a.internal/v2');
  assert.equal(X.scrub(X.scrub('k ' + X.SECRET)), X.scrub('k ' + X.SECRET));
});

test('logLine marks a hit and the marker, and stays plain when clean', () => {
  const hit = X.logLine(`[worker] h {"X-Api-Key":"${X.SECRET}"}`);
  assert.ok(hit.includes('k-bad') && hit.includes('k-ok'));
  assert.ok(!X.logLine('[worker] outbound POST https://a.internal/v2').includes('k-bad'));
});

test('a generation a Run pinned cannot be tombstoned', () => {
  assert.equal(X.runsUsing('gateway-key', 'g1'), 1);
  X.tombstone('gateway-key', 'g1');
  assert.equal(g('g1').status, 'superseded', 'refusal must not mutate');
  assert.ok(X.S.ui.flashes['ref-gateway-key-g1'], 'refusal must be explained');
});

test('an unreferenced generation burns, and leaves the Connector untestable', () => {
  assert.equal(X.runsUsing('gateway-key', 'g2'), 0);
  X.tombstone('gateway-key', 'g2');
  assert.equal(g('g2').status, 'tombstoned');
  assert.equal(X.activeGen('gateway-key'), null);
  X.runTest('ocr');
  assert.equal(X.S.ui.test.refused, true, 'a Connector with no usable key must refuse to test');
});

test('rotation appends an active generation and never mutates an old one', () => {
  const gens = X.cred('gateway-key').generations;
  const n = gens.length;
  const snapshot = JSON.parse(JSON.stringify(gens));
  X.rotate('gateway-key');
  assert.equal(gens.length, n + 1, 'rotation must append, not replace');
  assert.equal(gens[gens.length - 1].status, 'active');
  assert.deepEqual(gens.slice(0, n), snapshot, 'an existing generation changed');
  X.runTest('ocr');
  assert.equal(X.S.ui.test.refused, false);
  assert.equal(X.S.ui.test.genLabel, gens[gens.length - 1].label, 'test must use the newest key');
});

test('the auth header value is never echoed back', () => {
  X.runTest('ocr');
  assert.equal(X.S.ui.test.authHeader, 'X-Api-Key: «sent, never displayed»');
  assert.ok(!JSON.stringify(X.S.ui.test).includes(X.SECRET), 'the test result carries the secret');
});

test('a Connector with no Credential is legal and tests clean', () => {
  X.runTest('local');
  assert.equal(X.S.ui.test.refused, false);
  assert.equal(X.S.ui.test.authHeader, 'no credential on this Connector');
});

test("the combined OCR+LLM Connector carries its own key, not the OCR one", () => {
  X.runTest('combined');
  assert.equal(X.S.ui.test.refused, false);
  assert.equal(X.S.ui.test.genLabel, 'platform key, issued 1 Jun');
});
