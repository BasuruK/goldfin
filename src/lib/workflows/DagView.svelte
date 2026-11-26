<script lang="ts">
  import { badgeForProvider, type WorkflowNodeDraft } from './api.ts';
  import { layeredLayout } from './graph.ts';

  let {
    nodes,
    providerType
  }: {
    nodes: WorkflowNodeDraft[];
    providerType: (connectorId: string) => string | undefined;
  } = $props();

  const markerId = `dag-arrow-${crypto.randomUUID()}`;
  const layout = $derived(layeredLayout(nodes));
  const byId = $derived(Object.fromEntries(nodes.map(node => [node.id, node])) as Record<string, WorkflowNodeDraft>);

  const layerGap = 88;
  const nodeGap = 12;
  const padX = 24;
  const padY = 20;
  const boxH = 36;
  const maxLabelLen = 22;

  function displayLabel(raw: string): string {
    const label = raw.trim() || 'Node';
    if (label.length <= maxLabelLen) return label;
    return `${label.slice(0, maxLabelLen - 1)}…`;
  }

  function boxW(label: string): number {
    const shown = displayLabel(label);
    return Math.min(220, Math.max(96, shown.length * 7 + 56));
  }

  const positions = $derived.by(() => {
    const map: Record<string, { x: number; y: number; w: number; h: number }> = {};
    layout.forEach((layer, layerIndex) => {
      const y = padY + layerIndex * layerGap;
      const widths = layer.map(id => boxW(byId[id]?.name.trim() || id));
      const rowWidth = widths.reduce((sum, w, i) => sum + w + (i > 0 ? nodeGap : 0), 0);
      let x = padX + Math.max(0, (520 - rowWidth) / 2);
      layer.forEach((id, i) => {
        const w = widths[i] ?? 120;
        map[id] = { x, y, w, h: boxH };
        x += w + nodeGap;
      });
    });
    return map;
  });

  const width = $derived.by(() => {
    let maxRight = padX;
    for (const pos of Object.values(positions)) {
      maxRight = Math.max(maxRight, pos.x + pos.w + padX);
    }
    return Math.max(280, Math.min(720, maxRight));
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
    <marker
      id={markerId}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="6"
      markerHeight="6"
      orient="auto-start-reverse"
    >
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
        marker-end="url(#{markerId})"
      />
    {/if}
  {/each}
  {#each nodes as node (node.id)}
    {@const pos = positions[node.id]}
    {@const provider = providerType(node.connectorId)}
    {@const badge = badgeForProvider(provider)}
    {@const label = displayLabel(node.name)}
    {#if pos}
      <g class="dag-node">
        <rect x={pos.x} y={pos.y} width={pos.w} height={pos.h} rx="8" class="dag-box" />
        <text x={pos.x + 10} y={pos.y + 14} class="dag-badge">{badge}</text>
        <title>{node.name.trim() || 'Node'}</title>
        <text x={pos.x + 10} y={pos.y + 28} class="dag-label">{label}</text>
      </g>
    {/if}
  {/each}
</svg>

<style>
  .dag {
    inline-size: 100%;
    max-inline-size: 720px;
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