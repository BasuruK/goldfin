import type { WorkflowNodeDraft } from './api.ts';

function normalizeInputs(inputs: readonly string[]): string[] {
  return inputs.map(id => id.trim()).filter(id => id !== '');
}

function indexNodes(nodes: readonly WorkflowNodeDraft[]): Record<string, WorkflowNodeDraft> {
  return Object.fromEntries(nodes.map(node => [node.id, node]));
}

function wireInputs(
  node: WorkflowNodeDraft,
  byId: Record<string, WorkflowNodeDraft>,
  inDegree: Record<string, number>,
  edges: Record<string, string[]>
): string | null {
  const seen: Record<string, true> = {};
  for (const fromId of normalizeInputs(node.inputNodeIds)) {
    if (fromId === node.id || !byId[fromId] || seen[fromId]) return 'Invalid Workflow.';
    seen[fromId] = true;
    inDegree[node.id] = (inDegree[node.id] ?? 0) + 1;
    edges[fromId]?.push(node.id);
  }
  return null;
}

function topoVisitCount(inDegree: Record<string, number>, edges: Record<string, string[]>): number {
  const queue = Object.keys(inDegree).filter(id => inDegree[id] === 0);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    visited++;
    for (const to of edges[id] ?? []) {
      inDegree[to] = (inDegree[to] ?? 0) - 1;
      if (inDegree[to] === 0) queue.push(to);
    }
  }
  return visited;
}

/** Returns a cycle message when the graph is not a DAG. */
export function detectCycle(nodes: readonly WorkflowNodeDraft[]): string | null {
  const byId = indexNodes(nodes);
  const inDegree: Record<string, number> = {};
  const edges: Record<string, string[]> = {};
  for (const node of nodes) {
    inDegree[node.id] = 0;
    edges[node.id] = [];
  }
  for (const node of nodes) {
    const wiring = wireInputs(node, byId, inDegree, edges);
    if (wiring) return wiring;
  }
  if (topoVisitCount(inDegree, edges) !== nodes.length) return 'This Workflow cannot contain cycles.';
  return null;
}

/** Topological layers for the read-only DAG diagram (ids only). */
export function layeredLayout(nodes: readonly WorkflowNodeDraft[]): string[][] {
  const byId = indexNodes(nodes);
  const depth: Record<string, number> = {};
  const visit = (id: string, stack: Record<string, true>): number => {
    const cached = depth[id];
    if (cached !== undefined) return cached;
    if (stack[id]) return 0;
    stack[id] = true;
    const node = byId[id];
    const inputs = node ? normalizeInputs(node.inputNodeIds) : [];
    let level = 0;
    for (const fromId of inputs) {
      if (!byId[fromId]) continue;
      level = Math.max(level, visit(fromId, stack) + 1);
    }
    delete stack[id];
    depth[id] = level;
    return level;
  };
  for (const node of nodes) visit(node.id, {});
  const max = Math.max(0, ...Object.values(depth));
  const layers: string[][] = Array.from({ length: max + 1 }, () => []);
  for (const node of nodes) {
    const level = depth[node.id] ?? 0;
    layers[level]?.push(node.id);
  }
  for (const layer of layers) layer.sort((a, b) => a.localeCompare(b));
  return layers.filter(layer => layer.length > 0);
}