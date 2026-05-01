import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import {
  BASE_NODE_RADIUS,
  EDGE_STYLE,
  KIND_COLOR,
  KIND_ICON,
  type EdgeSource,
  type GraphNode,
  type RelationEdge,
} from './constants';

type Props = {
  nodes: GraphNode[];
  edges: RelationEdge[];
  nodeById: Map<string, GraphNode>;
  visibleKinds: Set<string>;
  visibleEdgeSources: Set<EdgeSource>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onDoubleClickNode: (nodeId: string) => void;
  containerWidth: number;
  containerHeight: number;
};

type FGNode = GraphNode & { x?: number; y?: number; fx?: number; fy?: number; [key: string]: unknown };
type FGLink = RelationEdge & { source: string | FGNode; target: string | FGNode; [key: string]: unknown };

const ICON_GLYPHS: Record<string, string> = {
  person: '',
  place: '',
  shield: '',
  'auto-stories': '',
  timeline: '',
  diamond: '',
  article: '',
};

function getIconGlyph(iconName: string): string {
  return ICON_GLYPHS[iconName] ?? '';
}

export function RelationWeb({
  nodes,
  edges,
  nodeById,
  visibleKinds,
  visibleEdgeSources,
  selectedNodeId,
  onSelectNode,
  onDoubleClickNode,
  containerWidth,
  containerHeight,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const connectionCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of edges) {
      if (!visibleEdgeSources.has(e.edgeSource)) continue;
      counts.set(e.sourceId, (counts.get(e.sourceId) ?? 0) + 1);
      counts.set(e.targetId, (counts.get(e.targetId) ?? 0) + 1);
    }
    return counts;
  }, [edges, visibleEdgeSources]);

  const filteredNodes = useMemo(
    () => nodes.filter((n) => visibleKinds.has(n.pageKind)),
    [nodes, visibleKinds],
  );

  const visibleNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes],
  );

  const filteredEdges = useMemo(
    () =>
      edges.filter(
        (e) =>
          visibleEdgeSources.has(e.edgeSource) &&
          visibleNodeIds.has(e.sourceId) &&
          visibleNodeIds.has(e.targetId),
      ),
    [edges, visibleEdgeSources, visibleNodeIds],
  );

  const graphData = useMemo(
    () => ({
      nodes: filteredNodes as FGNode[],
      links: filteredEdges.map((e) => ({
        ...e,
        source: e.sourceId,
        target: e.targetId,
      })) as FGLink[],
    }),
    [filteredNodes, filteredEdges],
  );

  const connectedToSelected = useMemo(() => {
    if (!selectedNodeId && !hoveredNodeId) return null;
    const activeId = selectedNodeId ?? hoveredNodeId;
    const set = new Set<string>();
    set.add(activeId!);
    for (const e of filteredEdges) {
      if (e.sourceId === activeId) set.add(e.targetId);
      if (e.targetId === activeId) set.add(e.sourceId);
    }
    return set;
  }, [selectedNodeId, hoveredNodeId, filteredEdges]);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-200);
    fg.d3Force('link')?.distance(100);
  }, []);

  const drawNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const count = connectionCount.get(node.id) ?? 0;
      const r = BASE_NODE_RADIUS + Math.min(count * 1.5, 8);
      const isActive = selectedNodeId === node.id || hoveredNodeId === node.id;
      const isDimmed = connectedToSelected && !connectedToSelected.has(node.id);
      const alpha = isDimmed ? 0.15 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Glow for active node
      if (isActive) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6, 0, 2 * Math.PI);
        ctx.fillStyle = node.color + '33';
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color + '33';
      ctx.fill();
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icon
      ctx.font = `${r * 0.8}px Material Icons`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = node.color;
      ctx.fillText(getIconGlyph(node.iconName), x, y);

      // Label
      if (globalScale > 0.4 || isActive) {
        const fontSize = Math.max(11, 12 / globalScale);
        ctx.font = `500 ${fontSize}px Manrope, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = isActive ? colors.onSurface : colors.onSurfaceVariant;
        ctx.fillText(node.title, x, y + r + 4);
      }

      ctx.restore();
    },
    [connectionCount, selectedNodeId, hoveredNodeId, connectedToSelected],
  );

  const drawLink = useCallback(
    (link: FGLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const source = link.source as FGNode;
      const target = link.target as FGNode;
      if (!source.x || !source.y || !target.x || !target.y) return;

      const style = EDGE_STYLE[link.edgeSource];
      const isDimmed =
        connectedToSelected &&
        !(connectedToSelected.has(source.id) && connectedToSelected.has(target.id));
      const alpha = isDimmed ? 0.08 : 0.7;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;

      if (style.dash.length > 0) {
        ctx.setLineDash(style.dash);
      }

      // Calculate angle and shorten line to node borders
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) { ctx.restore(); return; }
      const ux = dx / dist;
      const uy = dy / dist;

      const srcCount = connectionCount.get(source.id) ?? 0;
      const tgtCount = connectionCount.get(target.id) ?? 0;
      const srcR = BASE_NODE_RADIUS + Math.min(srcCount * 1.5, 8);
      const tgtR = BASE_NODE_RADIUS + Math.min(tgtCount * 1.5, 8);

      const sx = source.x + ux * srcR;
      const sy = source.y + uy * srcR;
      const tx = target.x - ux * tgtR;
      const ty = target.y - uy * tgtR;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Arrowhead for directed edges
      if (link.directed) {
        const arrowLen = 8;
        const arrowAngle = Math.PI / 7;
        const angle = Math.atan2(ty - sy, tx - sx);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(
          tx - arrowLen * Math.cos(angle - arrowAngle),
          ty - arrowLen * Math.sin(angle - arrowAngle),
        );
        ctx.moveTo(tx, ty);
        ctx.lineTo(
          tx - arrowLen * Math.cos(angle + arrowAngle),
          ty - arrowLen * Math.sin(angle + arrowAngle),
        );
        ctx.stroke();
      }

      // Edge label on hover
      const isHighlighted =
        !isDimmed &&
        (hoveredNodeId === source.id || hoveredNodeId === target.id);
      if (isHighlighted && globalScale > 0.5) {
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const fontSize = Math.max(9, 10 / globalScale);
        ctx.font = `${fontSize}px Manrope, sans-serif`;
        const textWidth = ctx.measureText(link.label).width;
        const pad = 4;

        ctx.globalAlpha = 0.85;
        ctx.fillStyle = colors.surfaceContainer;
        ctx.beginPath();
        ctx.roundRect(mx - textWidth / 2 - pad, my - fontSize / 2 - pad / 2, textWidth + pad * 2, fontSize + pad, 4);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.onSurfaceVariant;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(link.label, mx, my);
      }

      ctx.restore();
    },
    [connectedToSelected, hoveredNodeId, connectionCount],
  );

  const handleNodeClick = useCallback(
    (node: FGNode) => {
      onSelectNode(node.id === selectedNodeId ? null : node.id);
    },
    [onSelectNode, selectedNodeId],
  );

  const handleNodeDblClick = useCallback(
    (node: FGNode) => {
      onDoubleClickNode(node.id);
    },
    [onDoubleClickNode],
  );

  const handleBackgroundClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // Empty state
  if (filteredNodes.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Icon name="hub" size={48} color={colors.outlineVariant} />
        <Text variant="title-md" family="serif-display" style={{ color: colors.onSurfaceVariant, marginTop: spacing.md }}>
          No connections yet
        </Text>
        <Text variant="body-sm" style={{ color: colors.outline, marginTop: spacing.xs, textAlign: 'center', maxWidth: 300 }}>
          Add @mentions or relationships on your pages to see them here
        </Text>
      </View>
    );
  }

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={graphData as any}
      width={containerWidth}
      height={containerHeight}
      backgroundColor={colors.surfaceCanvas}
      nodeId="id"
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={(node: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
        const count = connectionCount.get(node.id) ?? 0;
        const r = BASE_NODE_RADIUS + Math.min(count * 1.5, 8);
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, r + 4, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      }}
      linkCanvasObject={drawLink}
      linkSource="sourceId"
      linkTarget="targetId"
      onNodeClick={handleNodeClick}
      onNodeHover={(node: FGNode | null) => setHoveredNodeId(node?.id ?? null)}
      onBackgroundClick={handleBackgroundClick}
      cooldownTicks={80}
      enableNodeDrag
      minZoom={0.3}
      maxZoom={6}
    />
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
});
