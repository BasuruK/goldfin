import { listConnectors, type SavedConnector } from '../connectors/api.ts';
import { enabledModelIds, pickModelId } from '../llm/api.ts';
import { listPrompts, type SavedPrompt } from '../prompts/api.ts';
import { ApiError } from '../request-core.ts';
import {
  connectorShowsModels,
  createBlankNode,
  createWorkflow,
  deleteWorkflow,
  draftFromSaved,
  listWorkflows,
  nodeKindForProvider,
  runWorkflowProbe,
  updateWorkflow,
  type SavedWorkflow,
  type WorkflowNodeDraft,
  type WorkflowProbeResult
} from './api.ts';
import { validateWorkflowGraph } from './graph.ts';

interface WorkflowDraft {
  workflowId: string | null;
  name: string;
  nodes: WorkflowNodeDraft[];
}

export interface WorkflowStoreState {
  workflows: SavedWorkflow[];
  listState: 'idle' | 'loading' | 'loaded' | 'failed';
  listError: string;
  connectors: SavedConnector[];
  connectorsState: 'idle' | 'loading' | 'loaded' | 'failed';
  prompts: SavedPrompt[];
  promptsState: 'idle' | 'loading' | 'loaded' | 'failed';
  selection: string | null;
  draft: WorkflowDraft | null;
  saving: boolean;
  saveError: string;
  saveNotice: string;
  deleteBusy: boolean;
  probeDocument: File | null;
  probeError: string;
  probeBusy: boolean;
  probeResult: WorkflowProbeResult | null;
}

export const workflowStore = $state<WorkflowStoreState>({
  workflows: [],
  listState: 'idle',
  listError: '',
  connectors: [],
  connectorsState: 'idle',
  prompts: [],
  promptsState: 'idle',
  selection: null,
  draft: null,
  saving: false,
  saveError: '',
  saveNotice: '',
  deleteBusy: false,
  probeDocument: null,
  probeError: '',
  probeBusy: false,
  probeResult: null
});

function connectorById(id: string): SavedConnector | undefined {
  return workflowStore.connectors.find(connector => connector.id === id);
}

function providerForConnector(connectorId: string): string | undefined {
  return connectorById(connectorId)?.providerType;
}

function existingNodeNames(exceptId?: string): string[] {
  return (workflowStore.draft?.nodes ?? [])
    .filter(node => node.id !== exceptId)
    .map(node => node.name.trim())
    .filter(name => name !== '');
}

function syncNodeForConnector(node: WorkflowNodeDraft): WorkflowNodeDraft {
  const connector = connectorById(node.connectorId);
  if (!connector) return { ...node, modelId: '', promptId: '', inputNodeIds: [] };
  const kind = nodeKindForProvider(connector.providerType);
  const showsModels = connectorShowsModels(connector.providerType);
  const models = enabledModelIds(connector);
  const modelId = showsModels ? pickModelId(node.modelId, models) : '';
  if (kind === 'document') return { ...node, modelId, promptId: '', inputNodeIds: [] };
  if (kind === 'llm') return { ...node, modelId };
  return { ...node, modelId: '', promptId: '', inputNodeIds: [] };
}

export async function loadWorkflowPage(): Promise<void> {
  workflowStore.listState = 'loading';
  workflowStore.connectorsState = 'loading';
  workflowStore.promptsState = 'loading';
  workflowStore.listError = '';
  try {
    const [workflows, connectors, prompts] = await Promise.all([
      listWorkflows(),
      listConnectors(),
      listPrompts()
    ]);
    workflowStore.workflows = workflows;
    workflowStore.connectors = connectors;
    workflowStore.prompts = prompts;
    workflowStore.listState = 'loaded';
    workflowStore.connectorsState = 'loaded';
    workflowStore.promptsState = 'loaded';
  } catch (error) {
    workflowStore.listState = 'failed';
    workflowStore.connectorsState = 'failed';
    workflowStore.promptsState = 'failed';
    workflowStore.listError =
      error instanceof ApiError ? error.message : 'Could not load Workflows. Try again.';
  }
}

export function disposeWorkflowsPage(): void {
  workflowStore.saveNotice = '';
  workflowStore.probeResult = null;
  workflowStore.probeError = '';
  workflowStore.probeBusy = false;
}

export function startNewWorkflow(): void {
  workflowStore.selection = null;
  workflowStore.draft = { workflowId: null, name: 'New workflow', nodes: [] };
  workflowStore.saveError = '';
  workflowStore.saveNotice = '';
  workflowStore.probeResult = null;
  workflowStore.probeError = '';
}

export function selectWorkflow(id: string): void {
  const saved = workflowStore.workflows.find(workflow => workflow.id === id);
  if (!saved) return;
  workflowStore.selection = id;
  workflowStore.draft = { workflowId: id, name: saved.name, nodes: draftFromSaved(saved) };
  workflowStore.saveError = '';
  workflowStore.saveNotice = '';
  workflowStore.probeResult = null;
  workflowStore.probeError = '';
}

function replaceDraft(draft: WorkflowDraft): void {
  workflowStore.draft = draft;
  workflowStore.saveError = '';
  workflowStore.probeResult = null;
  workflowStore.probeError = '';
}

export function setWorkflowName(name: string): void {
  const draft = workflowStore.draft;
  if (!draft) return;
  replaceDraft({ ...draft, name });
}

export function addWorkflowNode(): void {
  const draft = workflowStore.draft;
  if (!draft) return;
  const node = createBlankNode(existingNodeNames(), 'Node');
  replaceDraft({ ...draft, nodes: [...draft.nodes, node] });
}

export function removeWorkflowNode(nodeId: string): void {
  const draft = workflowStore.draft;
  if (!draft) return;
  const nodes = draft.nodes
    .filter(node => node.id !== nodeId)
    .map(node => ({
      ...node,
      inputNodeIds: node.inputNodeIds.filter(id => id !== nodeId)
    }));
  replaceDraft({ ...draft, nodes });
}

export function patchWorkflowNode(nodeId: string, patch: Partial<WorkflowNodeDraft>): void {
  const draft = workflowStore.draft;
  if (!draft) return;
  const nodes = draft.nodes.map(node => {
    if (node.id !== nodeId) return node;
    let next = { ...node, ...patch };
    if ('connectorId' in patch && patch.connectorId !== undefined) {
      const connector = connectorById(patch.connectorId);
      const defaultName = connector?.name ?? 'Node';
      if (node.name.trim() === '' || node.name === 'Node') {
        next.name = createBlankNode(existingNodeNames(nodeId), defaultName).name;
      }
      next = syncNodeForConnector(next);
    }
    if ('name' in patch) next = { ...next, name: patch.name ?? next.name };
    return next;
  });
  replaceDraft({ ...draft, nodes });
}

export function toggleNodeInput(nodeId: string, fromId: string, checked: boolean): void {
  const draft = workflowStore.draft;
  if (!draft) return;
  const nodes = draft.nodes.map(node => {
    if (node.id !== nodeId) return node;
    const inputs = checked
      ? node.inputNodeIds.includes(fromId)
        ? node.inputNodeIds
        : [...node.inputNodeIds, fromId]
      : node.inputNodeIds.filter(id => id !== fromId);
    return { ...node, inputNodeIds: inputs };
  });
  replaceDraft({ ...draft, nodes });
}

export function moveNodeInput(nodeId: string, fromId: string, direction: 'up' | 'down'): void {
  const draft = workflowStore.draft;
  if (!draft) return;
  const nodes = draft.nodes.map(node => {
    if (node.id !== nodeId) return node;
    const index = node.inputNodeIds.indexOf(fromId);
    if (index < 0) return node;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= node.inputNodeIds.length) return node;
    const inputs = [...node.inputNodeIds];
    const removed = inputs.splice(index, 1)[0];
    if (removed === undefined) return node;
    inputs.splice(target, 0, removed);
    return { ...node, inputNodeIds: inputs };
  });
  replaceDraft({ ...draft, nodes });
}

export async function saveWorkflowDraft(): Promise<void> {
  const draft = workflowStore.draft;
  if (!draft || workflowStore.saving) return;
  const validation = validateWorkflowGraph(draft.name, draft.nodes, providerForConnector);
  if (validation.kind === 'invalid') {
    workflowStore.saveError = validation.message;
    return;
  }
  workflowStore.saving = true;
  workflowStore.saveError = '';
  const workflowId = draft.workflowId;
  try {
    const saved = workflowId
      ? await updateWorkflow(workflowId, draft.name, draft.nodes)
      : await createWorkflow(draft.name, draft.nodes);
    const others = workflowStore.workflows.filter(workflow => workflow.id !== saved.id);
    workflowStore.workflows = [...others, saved].sort((a, b) => a.name.localeCompare(b.name));
    workflowStore.selection = saved.id;
    workflowStore.draft = { workflowId: saved.id, name: saved.name, nodes: draftFromSaved(saved) };
    workflowStore.saveNotice = `${saved.name} is saved.`;
  } catch (error) {
    workflowStore.saveError =
      error instanceof ApiError || error instanceof Error
        ? error.message
        : 'Could not save the Workflow. Try again.';
  } finally {
    workflowStore.saving = false;
  }
}

export async function deleteSelectedWorkflow(): Promise<void> {
  const id = workflowStore.selection;
  if (!id || workflowStore.deleteBusy) return;
  workflowStore.deleteBusy = true;
  try {
    await deleteWorkflow(id);
    workflowStore.workflows = workflowStore.workflows.filter(workflow => workflow.id !== id);
    workflowStore.selection = null;
    workflowStore.draft = null;
    workflowStore.saveNotice = '';
    workflowStore.probeResult = null;
  } catch (error) {
    workflowStore.saveError = error instanceof Error ? error.message : 'Could not delete the Workflow. Try again.';
  } finally {
    workflowStore.deleteBusy = false;
  }
}

export async function runWorkflowProbeFromStore(): Promise<void> {
  const draft = workflowStore.draft;
  const file = workflowStore.probeDocument;
  if (!draft?.workflowId || !file || workflowStore.probeBusy) return;
  workflowStore.probeBusy = true;
  workflowStore.probeError = '';
  workflowStore.probeResult = null;
  const workflowId = draft.workflowId;
  const nodeCount = draft.nodes.length;
  try {
    workflowStore.probeResult = await runWorkflowProbe(workflowId, file, nodeCount);
  } catch (error) {
    workflowStore.probeError =
      error instanceof ApiError || error instanceof Error
        ? error.message
        : 'Could not run the Workflow Probe. Try again.';
  } finally {
    workflowStore.probeBusy = false;
  }
}

export function workflowSelectItems(): { value: string; label: string }[] {
  return workflowStore.workflows.map(workflow => ({ value: workflow.id, label: workflow.name }));
}

export function connectorSelectItems(): { value: string; label: string }[] {
  return workflowStore.connectors.map(connector => ({ value: connector.id, label: connector.name }));
}

export function promptSelectItems(): { value: string; label: string }[] {
  return workflowStore.prompts.map(prompt => ({ value: prompt.id, label: prompt.name }));
}

export function upstreamCandidates(nodeId: string): { value: string; label: string }[] {
  const draft = workflowStore.draft;
  if (!draft) return [];
  return draft.nodes
    .filter(node => node.id !== nodeId)
    .map(node => ({ value: node.id, label: node.name.trim() || node.id }));
}