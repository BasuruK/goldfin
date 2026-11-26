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
import { draftFingerprint, isAutoDefaultNodeName, type WorkflowDraft } from './draft.ts';
import { sinkNodeIds, validateWorkflowGraph } from './graph.ts';

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
  probeSinkIds: Record<string, true>;
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
  probeResult: null,
  probeSinkIds: {}
});

let listOperation = 0;
let probeOperation = 0;
let probeAbort: AbortController | null = null;

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

function cancelProbe(): void {
  probeOperation += 1;
  probeAbort?.abort();
  probeAbort = null;
  workflowStore.probeBusy = false;
}

function clearProbeState(): void {
  workflowStore.probeResult = null;
  workflowStore.probeError = '';
  workflowStore.probeSinkIds = {};
}

function savedDraftForId(id: string): WorkflowDraft | null {
  const saved = workflowStore.workflows.find(workflow => workflow.id === id);
  if (!saved) return null;
  return { workflowId: saved.id, name: saved.name, nodes: draftFromSaved(saved) };
}

export function isWorkflowDraftDirty(): boolean {
  const draft = workflowStore.draft;
  if (!draft?.workflowId) return false;
  const savedDraft = savedDraftForId(draft.workflowId);
  if (!savedDraft) return true;
  return draftFingerprint(draft) !== draftFingerprint(savedDraft);
}

function reconcileSelectionAfterLoad(workflows: SavedWorkflow[]): void {
  if (!workflowStore.selection) return;
  const saved = workflows.find(workflow => workflow.id === workflowStore.selection);
  if (!saved) {
    workflowStore.selection = null;
    workflowStore.draft = null;
    return;
  }
  workflowStore.draft = { workflowId: saved.id, name: saved.name, nodes: draftFromSaved(saved) };
}

export async function loadWorkflowPage(): Promise<void> {
  const operation = ++listOperation;
  cancelProbe();
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
    if (operation !== listOperation) return;
    workflowStore.workflows = workflows;
    workflowStore.connectors = connectors;
    workflowStore.prompts = prompts;
    workflowStore.listState = 'loaded';
    workflowStore.connectorsState = 'loaded';
    workflowStore.promptsState = 'loaded';
    reconcileSelectionAfterLoad(workflows);
  } catch (error) {
    if (operation !== listOperation) return;
    workflowStore.listState = 'failed';
    workflowStore.connectorsState = 'failed';
    workflowStore.promptsState = 'failed';
    workflowStore.listError =
      error instanceof ApiError ? error.message : 'Could not load Workflows. Try again.';
  }
}

export function disposeWorkflowsPage(): void {
  listOperation += 1;
  cancelProbe();
  workflowStore.saveNotice = '';
  clearProbeState();
}

export function startNewWorkflow(): void {
  cancelProbe();
  workflowStore.selection = null;
  workflowStore.draft = { workflowId: null, name: 'New workflow', nodes: [] };
  workflowStore.saveError = '';
  workflowStore.saveNotice = '';
  clearProbeState();
}

export function selectWorkflow(id: string): void {
  const saved = workflowStore.workflows.find(workflow => workflow.id === id);
  if (!saved) return;
  cancelProbe();
  workflowStore.selection = id;
  workflowStore.draft = { workflowId: id, name: saved.name, nodes: draftFromSaved(saved) };
  workflowStore.saveError = '';
  workflowStore.saveNotice = '';
  clearProbeState();
}

function replaceDraft(draft: WorkflowDraft): void {
  workflowStore.draft = draft;
  workflowStore.saveError = '';
  workflowStore.saveNotice = '';
  clearProbeState();
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
      if (node.name.trim() === '' || isAutoDefaultNodeName(node.name)) {
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
    workflowStore.saveNotice = '';
    return;
  }
  workflowStore.saving = true;
  workflowStore.saveError = '';
  workflowStore.saveNotice = '';
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
    clearProbeState();
  } catch (error) {
    workflowStore.saveError =
      error instanceof ApiError ? error.message : 'Could not save the Workflow. Try again.';
  } finally {
    workflowStore.saving = false;
  }
}

export async function deleteSelectedWorkflow(): Promise<void> {
  const id = workflowStore.selection;
  if (!id || workflowStore.deleteBusy) return;
  workflowStore.deleteBusy = true;
  workflowStore.saveError = '';
  workflowStore.probeError = '';
  cancelProbe();
  try {
    await deleteWorkflow(id);
    workflowStore.workflows = workflowStore.workflows.filter(workflow => workflow.id !== id);
    workflowStore.selection = null;
    workflowStore.draft = null;
    workflowStore.saveNotice = '';
    clearProbeState();
  } catch (error) {
    workflowStore.saveError =
      error instanceof ApiError ? error.message : 'Could not delete the Workflow. Try again.';
  } finally {
    workflowStore.deleteBusy = false;
  }
}

export function stopWorkflowProbe(): void {
  if (!workflowStore.probeBusy) return;
  cancelProbe();
  clearProbeState();
}

function savedNodesForProbe(workflowId: string): WorkflowNodeDraft[] {
  const saved = workflowStore.workflows.find(workflow => workflow.id === workflowId);
  return saved ? draftFromSaved(saved) : [];
}

function probeStartBlocked(): boolean {
  const draft = workflowStore.draft;
  const file = workflowStore.probeDocument;
  if (!draft?.workflowId || !file || workflowStore.probeBusy) return true;
  return isWorkflowDraftDirty();
}

function mapProbeError(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Could not run the Workflow Probe. Try again.';
}

export async function runWorkflowProbeFromStore(): Promise<void> {
  if (probeStartBlocked()) return;

  cancelProbe();
  const draft = workflowStore.draft;
  const file = workflowStore.probeDocument;
  if (!draft?.workflowId || !file) return;
  const operation = ++probeOperation;
  const controller = new AbortController();
  probeAbort = controller;
  workflowStore.probeBusy = true;
  workflowStore.probeError = '';
  workflowStore.probeResult = null;

  const workflowId = draft.workflowId;
  const savedNodes = savedNodesForProbe(workflowId);
  const nodeCount = savedNodes.length || draft.nodes.length;

  try {
    const result = await runWorkflowProbe(workflowId, file, nodeCount, controller.signal);
    if (operation !== probeOperation) return;
    workflowStore.probeResult = result;
    workflowStore.probeSinkIds = sinkNodeIds(savedNodes);
  } catch (error) {
    if (operation !== probeOperation) return;
    workflowStore.probeError = mapProbeError(error);
  } finally {
    if (operation === probeOperation) {
      workflowStore.probeBusy = false;
      probeAbort = null;
    }
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

export function nodeLabel(nodeId: string): string {
  const draft = workflowStore.draft;
  const node = draft?.nodes.find(entry => entry.id === nodeId);
  return node?.name.trim() || nodeId;
}