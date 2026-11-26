/**
 * Workflow API client (ADR 0014). Saves are synchronous; Probe runs may take minutes.
 */

import { ApiError, fetchApiRequest, isJsonRecord, malformed, requestJson } from '../request-core.ts';

const WORKFLOWS_PATH = '/api/v1/workflows';
const REJECTED = 'The Workflow was rejected.';
const PROBE_REJECTED = 'Invalid Workflow Probe request.';

/** Route processing budget scales with node count; mirrors internal/probe/workflow.go. */
const PROBE_PER_NODE_MS = 5 * 60 * 1000 + 3 * 60 * 1000 + 1_000;
const PROBE_BASE_MS = 35_000;

export type NodeKind = 'document' | 'llm';

export interface WorkflowNodeDraft {
  id: string;
  name: string;
  connectorId: string;
  modelId: string;
  promptId: string;
  inputNodeIds: string[];
}

interface SavedWorkflowNode {
  id: string;
  name: string;
  connectorId: string;
  modelId?: string;
  promptId?: string;
  inputNodeIds: string[];
}

export interface SavedWorkflow {
  id: string;
  name: string;
  nodes: SavedWorkflowNode[];
  createdAt: string;
  updatedAt: string;
}

interface WorkflowProbeNode {
  nodeId: string;
  nodeName: string;
  kind: string;
  modelId?: string;
  promptVersion?: number;
  status: 'completed' | 'incomplete' | 'failed';
  stopReason?: string;
  text?: string;
  durationMs: number;
  error?: string;
}

export interface WorkflowProbeResult {
  workflowId: string;
  nodes: WorkflowProbeNode[];
}

export function badgeForProvider(providerType: string | undefined): string {
  if (!providerType) return 'Unset';
  if (providerType === 'web_request') return 'REST';
  const kind = nodeKindForProvider(providerType);
  if (kind === 'llm') return 'LLM';
  if (kind === 'document') return 'OCR';
  return 'Unset';
}

export function nodeKindForProvider(providerType: string): NodeKind | null {
  if (providerType === 'openai' || providerType === 'openai_compatible') return 'llm';
  if (
    providerType === 'azure_document_intelligence'
    || providerType === 'azure_foundry'
    || providerType === 'web_request'
  ) {
    return 'document';
  }
  return null;
}

export function connectorShowsModels(providerType: string): boolean {
  return providerType === 'openai' || providerType === 'openai_compatible' || providerType === 'azure_foundry';
}

function parseInputIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw malformed();
  return value;
}

function optionalId(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function parseNode(value: unknown): SavedWorkflowNode {
  if (!isJsonRecord(value)) throw malformed();
  const { id, name, connectorId, modelId, promptId, inputNodeIds } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof connectorId !== 'string') throw malformed();
  const node: SavedWorkflowNode = { id, name, connectorId, inputNodeIds: parseInputIds(inputNodeIds) };
  const model = optionalId(modelId);
  const prompt = optionalId(promptId);
  if (model) node.modelId = model;
  if (prompt) node.promptId = prompt;
  return node;
}

function parseWorkflow(value: unknown): SavedWorkflow {
  if (!isJsonRecord(value)) throw malformed();
  const { id, name, nodes, createdAt, updatedAt } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof createdAt !== 'string' || typeof updatedAt !== 'string') {
    throw malformed();
  }
  if (!Array.isArray(nodes)) throw malformed();
  return { id, name, createdAt, updatedAt, nodes: nodes.map(parseNode) };
}

function probeNodeCore(value: Record<string, unknown>): WorkflowProbeNode {
  const { nodeId, nodeName, kind, status, durationMs } = value;
  if (
    typeof nodeId !== 'string'
    || typeof nodeName !== 'string'
    || typeof kind !== 'string'
    || typeof durationMs !== 'number'
    || !Number.isFinite(durationMs)
  ) {
    throw malformed();
  }
  const normalized = status;
  if (normalized !== 'completed' && normalized !== 'incomplete' && normalized !== 'failed') throw malformed();
  return { nodeId, nodeName, kind, status: normalized, durationMs };
}

function parseProbeNode(value: unknown): WorkflowProbeNode {
  if (!isJsonRecord(value)) throw malformed();
  const item = probeNodeCore(value);
  const model = optionalId(value.modelId);
  if (model) item.modelId = model;
  if (typeof value.promptVersion === 'number') item.promptVersion = value.promptVersion;
  if (typeof value.stopReason === 'string' && value.stopReason) item.stopReason = value.stopReason;
  if (typeof value.text === 'string') item.text = value.text;
  if (typeof value.error === 'string' && value.error) item.error = value.error;
  return item;
}

function workflowBody(name: string, nodes: readonly WorkflowNodeDraft[]): string {
  const payload = {
    name: name.trim(),
    nodes: nodes.map(node => ({
      id: node.id,
      name: node.name.trim(),
      connectorId: node.connectorId,
      ...(node.modelId.trim() ? { modelId: node.modelId.trim() } : {}),
      ...(node.promptId.trim() ? { promptId: node.promptId.trim() } : {}),
      inputNodeIds: node.inputNodeIds
    }))
  };
  return JSON.stringify(payload);
}

function probeTimeoutMs(nodeCount: number): number {
  const count = Math.max(1, nodeCount);
  return PROBE_PER_NODE_MS * count + PROBE_BASE_MS;
}

export function draftFromSaved(workflow: SavedWorkflow): WorkflowNodeDraft[] {
  return workflow.nodes.map(node => ({
    id: node.id,
    name: node.name,
    connectorId: node.connectorId,
    modelId: node.modelId ?? '',
    promptId: node.promptId ?? '',
    inputNodeIds: [...node.inputNodeIds]
  }));
}

export function createBlankNode(existingNames: readonly string[], connectorName: string): WorkflowNodeDraft {
  const taken = new Set(existingNames);
  const base = connectorName.trim() || 'Node';
  let name = base;
  let suffix = 2;
  while (taken.has(name)) {
    name = `${base} ${suffix}`;
    suffix++;
  }
  return {
    id: crypto.randomUUID(),
    name,
    connectorId: '',
    modelId: '',
    promptId: '',
    inputNodeIds: []
  };
}

export async function listWorkflows(): Promise<SavedWorkflow[]> {
  const { workflows } = await requestJson(WORKFLOWS_PATH, REJECTED);
  if (!Array.isArray(workflows)) throw malformed();
  return workflows.map(parseWorkflow);
}

export async function createWorkflow(name: string, nodes: readonly WorkflowNodeDraft[]): Promise<SavedWorkflow> {
  const record = await requestJson(WORKFLOWS_PATH, REJECTED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: workflowBody(name, nodes)
  });
  return parseWorkflow(record);
}

export async function updateWorkflow(
  id: string,
  name: string,
  nodes: readonly WorkflowNodeDraft[]
): Promise<SavedWorkflow> {
  const record = await requestJson(`${WORKFLOWS_PATH}/${encodeURIComponent(id)}`, REJECTED, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: workflowBody(name, nodes)
  });
  return parseWorkflow(record);
}

export async function deleteWorkflow(id: string): Promise<void> {
  await fetchApiRequest({
    path: `${WORKFLOWS_PATH}/${encodeURIComponent(id)}`,
    init: { method: 'DELETE' },
    timeoutMs: 10_000,
    messages: {
      timeout: 'The request timed out. Try again.',
      unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
      unavailable: 'Goldfin is unavailable right now. Try again.',
      rejected: REJECTED
    },
    createError: (kind, message) => new ApiError(kind === 'canceled' ? 'malformed' : kind, message)
  });
}

export async function runWorkflowProbe(
  workflowId: string,
  document: File,
  nodeCount: number,
  signal?: AbortSignal
): Promise<WorkflowProbeResult> {
  const form = new FormData();
  form.set('document', document, document.name);
  const { record } = await fetchApiRequest({
    path: `${WORKFLOWS_PATH}/${encodeURIComponent(workflowId)}/probe`,
    init: { method: 'POST', body: form },
    timeoutMs: probeTimeoutMs(nodeCount),
    callerSignal: signal,
    messages: {
      timeout: 'The Workflow Probe timed out.',
      unreachable: 'Could not reach the API. Check that Goldfin is running, then try again.',
      unavailable: 'Goldfin is unavailable right now. Try again.',
      rejected: PROBE_REJECTED
    },
    createError: (kind, message) => new ApiError(kind === 'canceled' ? 'malformed' : kind, message),
    httpTimeoutStatuses: true,
    statusMessage: status => {
      if (status === 408 || status === 504) return 'The Workflow Probe timed out.';
      if (status >= 500) return 'Goldfin is unavailable right now. Try again.';
      if (status === 413) return 'Request is too large.';
      return PROBE_REJECTED;
    }
  });
  if (!isJsonRecord(record) || typeof record.workflowId !== 'string' || !Array.isArray(record.nodes)) {
    throw malformed();
  }
  return { workflowId: record.workflowId, nodes: record.nodes.map(parseProbeNode) };
}