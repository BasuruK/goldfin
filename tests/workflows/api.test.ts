import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { ApiError } from '../../src/lib/request-core.ts';
import {
  createWorkflow,
  deleteWorkflow,
  listWorkflows,
  nodeKindForProvider,
  runWorkflowProbe,
  type WorkflowNodeDraft
} from '../../src/lib/workflows/api.ts';

const NODE: WorkflowNodeDraft = {
  id: 'n1',
  name: 'OCR',
  connectorId: 'c1',
  modelId: '',
  promptId: '',
  inputNodeIds: []
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    }
  };
}

function replyWith(status: number, body: unknown) {
  mock.method(globalThis, 'fetch', async () => jsonResponse(status, body));
}

afterEach(() => mock.restoreAll());

describe('nodeKindForProvider', () => {
  it('maps OCR and LLM provider kinds', () => {
    assert.equal(nodeKindForProvider('azure_document_intelligence'), 'document');
    assert.equal(nodeKindForProvider('openai'), 'llm');
    assert.equal(nodeKindForProvider('unknown'), null);
  });
});

describe('listWorkflows', () => {
  it('parses a list payload', async () => {
    replyWith(200, {
      workflows: [
        {
          id: 'w1',
          name: 'Invoices',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          nodes: [{ id: 'n1', name: 'OCR', connectorId: 'c1', inputNodeIds: [] }]
        }
      ]
    });
    const items = await listWorkflows();
    assert.equal(items.length, 1);
    assert.equal(items[0]?.name, 'Invoices');
  });
});

describe('createWorkflow', () => {
  it('posts a trimmed graph', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async (_url: string, init?: RequestInit) => {
      const raw = init?.body;
      const body = JSON.parse(typeof raw === 'string' ? raw : '{}') as { name: string };
      assert.equal(body.name, 'Invoices');
      return jsonResponse(201, {
        id: 'w1',
        name: 'Invoices',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        nodes: [{ id: 'n1', name: 'OCR', connectorId: 'c1', inputNodeIds: [] }]
      });
    });
    const saved = await createWorkflow(' Invoices ', [NODE]);
    assert.equal(saved.id, 'w1');
    assert.equal(fetchMock.mock.calls.length, 1);
  });
});

describe('deleteWorkflow', () => {
  it('treats 204 as success', async () => {
    replyWith(204, null);
    await assert.doesNotReject(deleteWorkflow('w1'));
  });

  it('maps 404 to rejection', async () => {
    replyWith(404, { message: 'Workflow not found.' });
    await assert.rejects(deleteWorkflow('missing'), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      return true;
    });
  });
});

describe('runWorkflowProbe', () => {
  it('parses node probe results', async () => {
    mock.method(globalThis, 'fetch', async () =>
      jsonResponse(200, {
        workflowId: 'w1',
        nodes: [
          {
            nodeId: 'n1',
            nodeName: 'OCR',
            kind: 'ocr',
            status: 'completed',
            text: 'text',
            durationMs: 12
          },
          {
            nodeId: 'n2',
            nodeName: 'Extract',
            kind: 'llm',
            status: 'incomplete',
            stopReason: 'max_tokens',
            text: 'partial',
            promptVersion: 2,
            durationMs: 34
          }
        ]
      })
    );
    const file = new File(['x'], 'fixture.pdf', { type: 'application/pdf' });
    const result = await runWorkflowProbe('w1', file, 2);
    assert.equal(result.nodes.length, 2);
    assert.equal(result.nodes[1]?.promptVersion, 2);
    assert.equal(result.nodes[1].stopReason, 'max_tokens');
  });
});