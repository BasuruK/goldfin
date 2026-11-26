import type { WorkflowNodeDraft } from './api.ts';

export interface WorkflowDraft {
  workflowId: string | null;
  name: string;
  nodes: WorkflowNodeDraft[];
}

export function draftFingerprint(draft: WorkflowDraft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    nodes: draft.nodes.map(node => ({
      id: node.id,
      name: node.name.trim(),
      connectorId: node.connectorId,
      modelId: node.modelId.trim(),
      promptId: node.promptId.trim(),
      inputNodeIds: [...node.inputNodeIds]
    }))
  });
}

export function isAutoDefaultNodeName(name: string): boolean {
  return /^Node(?: \d+)?$/.test(name.trim());
}