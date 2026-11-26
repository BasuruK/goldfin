<script lang="ts">
  import { nodeKindForProvider, type WorkflowNodeDraft } from './api.ts';
  import { layeredLayout } from './graph.ts';

  let {
    nodes,
    providerType
  }: {
    nodes: WorkflowNodeDraft[];
    providerType: (connectorId: string) => string | undefined;
  } = $props();

  const layout = $derived(layeredLayout(nodes));
  const byId = $derived(Object.fromEntries(nodes.map(node => [node.id, node])) as Record<string, WorkflowNodeDraft>);

  const width = 520;
  const layerGap = 88;
  const nodeGap = 12;
  const padX = 24;
  const padY = 20;
  const boxH = 36;

  function boxW(label: string): number {
    return Math.min(200, Math.max(96, label.length * 7 + 48));
  }

  const positions = $derived.by(() => {
    const map: Record<string, { x: number; y: number; w: number; h: number }> = {};
    layout.forEach((layer, layerIndex) => {
      const y = padY + layerIndex * layerGap;
      const widths = layer.map(id => boxW(byId[id]?.name.trim() || id));
      const rowWidth = widths.reduce((sum, w, i) => sum + w + (i > 0 ? nodeGap : 0), 0);
      let x = padX + Math.max(0, (width - rowWidth) / 2);
      layer.forEach((id, i) => {
        const w = widths[i] ?? 120;
        map[id] = { x, y, w, h: boxH };
        x += w + nodeGap;
      });
    });
    return map;
  });

  const height = $derived(padY * 2 + Math.max(1, layout.length) * layerGap);

  const edges = $derived(
    nodes.flatMap(node =>
      node.inputNodeIds.map(fromId => ({ from: fromId, to: node.id }))
    )
  );
</script>

<svg class="dag" viewBox="0 0 {width} {height}" role="img" aria-label="Workflow graph">
  <defs>
    <marker id="dag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ufg2)" />
    </marker>
  </defs>
  {#each edges as edge (edge.from + '→' + edge.to)}
    {@const from = positions[edge.from]}
    {@const to = positions[edge.to]}
    {#if from && to}
      <line
        class="dag-edge"
        x1={from.x + from.w / 2}
        y1={from.y + from.h}
        x2={to.x + to.w / 2}
        y2={to.y}
        marker-end="url(#dag-arrow)"
      />
    {/if}
  {/each}
  {#each nodes as node (node.id)}
    {@const pos = positions[node.id]}
    {@const provider = providerType(node.connectorId)}
    {@const kind = provider ? nodeKindForProvider(provider) : null}
    {#if pos}
      <g class="dag-node">
        <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx="8" class="dag-box" />
        <text x={pos.x + 10} y={pos.y + 14} class="dag-badge">{kind === 'llm' ? 'LLM' : 'OCR'}</text>
        <text x={pos.x + 10} y={pos.y + 28} class="dag-label">{node.name.trim() || 'Node'}</text>
      </g>
    {/if}
  {/each}
</svg>

<style>
  .dag {
    inline-size: 100%;
    max-inline-size: 520px;
    block-size: auto;
    border: 1px solid var(--uline);
    border-radius: 8px;
    background: var(--usurf);
  }
  .dag-edge {
    stroke: var(--ufg2);
    stroke-width: 1.2;
    fill: none;
  }
  .dag-box {
    fill: var(--uhead);
    stroke: var(--uline);
  }
  .dag-badge {
    font: 600 9px var(--font-mono);
    fill: var(--ufg2);
    text-transform: uppercase;
  }
  .dag-label {
    font: 600 13px var(--font-ui);
    fill: var(--ufg);
  }
</style>