import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectCycle, sinkNodeIds, validateWorkflowGraph } from '../../src/lib/workflows/graph.ts';
import type { WorkflowNodeDraft } from '../../src/lib/workflows/api.ts';

const ocr: WorkflowNodeDraft = {
  id: 'ocr',
  name: 'OCR',
  connectorId: 'c-ocr',
  modelId: '',
  promptId: '',
  inputNodeIds: []
};

const llm: WorkflowNodeDraft = {
  id: 'llm',
  name: 'Extract',
  connectorId: 'c-llm',
  modelId: 'gpt-4o',
  promptId: 'p1',
  inputNodeIds: ['ocr']
};

describe('detectCycle', () => {
  it('accepts a linear graph', () => {
    assert.equal(detectCycle([ocr, llm]), null);
  });

  it('rejects a cycle between LLM nodes', () => {
    const a: WorkflowNodeDraft = { ...llm, id: 'a', name: 'A', inputNodeIds: ['b'] };
    const b: WorkflowNodeDraft = { ...llm, id: 'b', name: 'B', inputNodeIds: ['a'] };
    assert.match(detectCycle([ocr, a, b]) ?? '', /cycle/i);
  });
});

describe('validateWorkflowGraph', () => {
  const provider = (id: string) =>
    id === 'c-ocr' ? 'azure_document_intelligence' : id === 'c-llm' ? 'openai' : undefined;

  it('rejects duplicate node names', () => {
    const second = { ...llm, id: 'llm2', name: 'Extract' };
    const result = validateWorkflowGraph('W', [ocr, llm, second], provider);
    assert.ok(result.kind === 'invalid' && /unique/i.test(result.message));
  });

  it('accepts a valid OCR → LLM graph', () => {
    const result = validateWorkflowGraph('W', [ocr, llm], provider);
    assert.equal(result.kind, 'valid');
  });

  it('counts workflow name length in Unicode code points', () => {
    const long = '日'.repeat(81);
    const result = validateWorkflowGraph(long, [ocr, llm], provider);
    assert.ok(result.kind === 'invalid' && /80 characters/i.test(result.message));
  });
});

describe('sinkNodeIds', () => {
  it('marks leaf nodes without downstream consumers', () => {
    const sinks = sinkNodeIds([ocr, llm]);
    assert.ok(sinks.llm);
    assert.ok(!sinks.ocr);
  });
});