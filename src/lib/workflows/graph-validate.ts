import { connectorShowsModels, nodeKindForProvider, type WorkflowNodeDraft } from './api.ts';
import { detectCycle } from './graph-cycle.ts';

export type GraphValidation =
  | { kind: 'valid' }
  | { kind: 'invalid'; message: string };

function normalizeInputs(inputs: readonly string[]): string[] {
  return inputs.map(id => id.trim()).filter(id => id !== '');
}

function validateWorkflowName(name: string): GraphValidation | null {
  const trimmed = name.trim();
  if (!trimmed) return { kind: 'invalid', message: 'Enter a Workflow name before saving.' };
  if ([...trimmed].length > 80) return { kind: 'invalid', message: 'Workflow name must be 80 characters or fewer.' };
  return null;
}

function validateDocumentNode(
  nodeName: string,
  node: WorkflowNodeDraft,
  provider: string
): GraphValidation | null {
  if (node.promptId.trim()) return { kind: 'invalid', message: 'Invalid Workflow.' };
  if (normalizeInputs(node.inputNodeIds).length > 0) {
    return { kind: 'invalid', message: 'OCR nodes cannot take upstream inputs.' };
  }
  if (connectorShowsModels(provider) && !node.modelId.trim()) {
    return { kind: 'invalid', message: `Choose a model for ${nodeName}.` };
  }
  if (!connectorShowsModels(provider) && node.modelId.trim()) {
    return { kind: 'invalid', message: 'Invalid Workflow.' };
  }
  return null;
}

function validateLlmNode(nodeName: string, node: WorkflowNodeDraft, nodeIds: Record<string, true>): GraphValidation | null {
  if (!node.promptId.trim()) return { kind: 'invalid', message: `Choose a Prompt for ${nodeName}.` };
  if (!node.modelId.trim()) return { kind: 'invalid', message: `Choose a model for ${nodeName}.` };
  const inputs = normalizeInputs(node.inputNodeIds);
  if (inputs.length === 0) return { kind: 'invalid', message: `${nodeName} needs at least one upstream input.` };
  const missing = inputs.some(fromId => !nodeIds[fromId]);
  if (missing) return { kind: 'invalid', message: 'Invalid Workflow.' };
  return null;
}

function validateSingleNode(
  node: WorkflowNodeDraft,
  nodeIds: Record<string, true>,
  names: Record<string, true>,
  connectorProvider: (connectorId: string) => string | undefined
): GraphValidation | null {
  const nodeName = node.name.trim();
  if (!nodeName) return { kind: 'invalid', message: 'Every node needs a name.' };
  if (names[nodeName]) return { kind: 'invalid', message: 'Node names must be unique within a Workflow.' };
  names[nodeName] = true;
  if (!node.connectorId.trim()) return { kind: 'invalid', message: 'Every node needs a Connector.' };
  const provider = connectorProvider(node.connectorId);
  if (!provider) return { kind: 'invalid', message: 'Every node needs a saved Connector.' };
  const kind = nodeKindForProvider(provider);
  if (!kind) return { kind: 'invalid', message: 'Invalid Workflow.' };
  if (kind === 'document') return validateDocumentNode(nodeName, node, provider);
  return validateLlmNode(nodeName, node, nodeIds);
}

export function validateWorkflowGraph(
  name: string,
  nodes: readonly WorkflowNodeDraft[],
  connectorProvider: (connectorId: string) => string | undefined
): GraphValidation {
  const nameError = validateWorkflowName(name);
  if (nameError) return nameError;
  if (nodes.length === 0) return { kind: 'invalid', message: 'Add at least one node before saving.' };
  const nodeIds = Object.fromEntries(nodes.map(node => [node.id, true as const]));
  const names: Record<string, true> = {};
  for (const node of nodes) {
    const nodeError = validateSingleNode(node, nodeIds, names, connectorProvider);
    if (nodeError) return nodeError;
  }
  const cycle = detectCycle(nodes);
  if (cycle) return { kind: 'invalid', message: cycle };
  return { kind: 'valid' };
}

export function sinkNodeIds(nodes: readonly WorkflowNodeDraft[]): Record<string, true> {
  const referenced: Record<string, true> = {};
  for (const node of nodes) {
    for (const id of normalizeInputs(node.inputNodeIds)) referenced[id] = true;
  }
  const sinks: Record<string, true> = {};
  for (const node of nodes) {
    if (!referenced[node.id]) sinks[node.id] = true;
  }
  return sinks;
}