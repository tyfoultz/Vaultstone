import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import {
  BASE_NODE_RADIUS,
  EDGE_SOURCE_LABEL,
  EDGE_STYLE,
  KIND_COLOR,
  KIND_LABEL,
  type EdgeSource,
  type GraphNode,
  type RelationEdge,
} from './constants';

// `react-force-graph-2d` references `window` at module scope, so loading
// it during SSR (expo-router static render) crashes. Defer the import to
// useEffect so it only runs in the browser.
type ForceGraph2DComponent = React.ComponentType<any>;

type Props = {
  nodes: GraphNode[];
  edges: RelationEdge[];
  nodeById: Map<string, GraphNode>;
  visibleKinds: Set<string>;
  visibleEdgeSources: Set<EdgeSource>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onDoubleClickNode: (nodeId: string) => void;
  onHideNode?: (nodeId: string) => void;
  containerWidth: number;
  containerHeight: number;
};

type FGNode = GraphNode & { x?: number; y?: number; fx?: number; fy?: number; [key: string]: unknown };
type FGLink = RelationEdge & { source: string | FGNode; target: string | FGNode; [key: string]: unknown };

function drawNodeIcon(ctx: CanvasRenderingContext2D, iconName: string, cx: number, cy: number, s: number, clr: string) {
  ctx.strokeStyle = clr;
  ctx.fillStyle = clr;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (iconName) {
    case 'person': {
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.22, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + s * 0.6, s * 0.38, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      break;
    }
    case 'place': {
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.08, s * 0.22, Math.PI, 0);
      ctx.lineTo(cx, cy + s * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'shield': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.38);
      ctx.lineTo(cx + s * 0.32, cy - s * 0.18);
      ctx.lineTo(cx + s * 0.32, cy + s * 0.05);
      ctx.quadraticCurveTo(cx + s * 0.28, cy + s * 0.35, cx, cy + s * 0.42);
      ctx.quadraticCurveTo(cx - s * 0.28, cy + s * 0.35, cx - s * 0.32, cy + s * 0.05);
      ctx.lineTo(cx - s * 0.32, cy - s * 0.18);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'auto-stories': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.08);
      ctx.lineTo(cx - s * 0.32, cy - s * 0.28);
      ctx.lineTo(cx - s * 0.32, cy + s * 0.22);
      ctx.lineTo(cx, cy + s * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.08);
      ctx.lineTo(cx + s * 0.32, cy - s * 0.28);
      ctx.lineTo(cx + s * 0.32, cy + s * 0.22);
      ctx.lineTo(cx, cy + s * 0.12);
      ctx.stroke();
      break;
    }
    case 'timeline': {
      const dots = [
        { x: cx - s * 0.28, y: cy - s * 0.2 },
        { x: cx - s * 0.05, y: cy + s * 0.05 },
        { x: cx + s * 0.12, y: cy - s * 0.12 },
        { x: cx + s * 0.28, y: cy + s * 0.2 },
      ];
      ctx.beginPath();
      ctx.moveTo(dots[0].x, dots[0].y);
      for (let i = 1; i < dots.length; i++) ctx.lineTo(dots[i].x, dots[i].y);
      ctx.stroke();
      for (const d of dots) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'diamond': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 0.32);
      ctx.lineTo(cx + s * 0.28, cy);
      ctx.lineTo(cx, cy + s * 0.32);
      ctx.lineTo(cx - s * 0.28, cy);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    default: {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.2, cy - s * 0.12);
      ctx.lineTo(cx + s * 0.2, cy - s * 0.12);
      ctx.moveTo(cx - s * 0.2, cy + s * 0.02);
      ctx.lineTo(cx + s * 0.2, cy + s * 0.02);
      ctx.moveTo(cx - s * 0.2, cy + s * 0.16);
      ctx.lineTo(cx + s * 0.1, cy + s * 0.16);
      ctx.stroke();
      break;
    }
  }
}

type ContextMenu = { x: number; y: number; nodeId: string; title: string };

export function RelationWeb({
  nodes,
  edges,
  visibleKinds,
  visibleEdgeSources,
  selectedNodeId,
  onSelectNode,
  onDoubleClickNode,
  onHideNode,
  containerWidth,
  containerHeight,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const containerRef = useRef<View>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [ForceGraph2D, setForceGraph2D] = useState<ForceGraph2DComponent | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);

  const dragNodeRef = useRef<string | null>(null);
  const preDragPins = useRef<Map<string, { fx?: number; fy?: number }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    import('react-force-graph-2d').then((mod) => {
      if (!cancelled) setForceGraph2D(() => mod.default);
    });
    return () => { cancelled = true; };
  }, []);

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

  const collisionRadius = useCallback(
    (node: FGNode) => {
      const count = connectionCount.get(node.id) ?? 0;
      const r = BASE_NODE_RADIUS + Math.min(count * 1.5, 8);
      const labelHalfWidth = node.title.length * 3.5;
      return Math.max(r, labelHalfWidth) + 12;
    },
    [connectionCount],
  );

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength(-400);
    fg.d3Force('link')?.distance(140);

    // @ts-expect-error d3-force is a transitive dep of react-force-graph-2d, no separate @types
    import('d3-force').then(({ forceCollide }: { forceCollide: any }) => {
      fg.d3Force('collision', forceCollide().radius(collisionRadius).strength(0.8).iterations(3));
    });
  }, [collisionRadius]);

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

      if (isActive) {
        ctx.beginPath();
        ctx.arc(x, y, r + 6, 0, 2 * Math.PI);
        ctx.fillStyle = node.color + '33';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color + '33';
      ctx.fill();
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 2;
      ctx.stroke();

      drawNodeIcon(ctx, node.iconName, x, y, r * 0.7, node.color);

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

  const getNeighborIds = useCallback(
    (nodeId: string): Set<string> => {
      const s = new Set<string>();
      s.add(nodeId);
      for (const e of filteredEdges) {
        if (e.sourceId === nodeId) s.add(e.targetId);
        if (e.targetId === nodeId) s.add(e.sourceId);
      }
      return s;
    },
    [filteredEdges],
  );

  const handleNodeDrag = useCallback(
    (node: FGNode) => {
      if (dragNodeRef.current === node.id) return;
      dragNodeRef.current = node.id;

      const neighbors = getNeighborIds(node.id);
      const fg = fgRef.current;
      if (!fg) return;
      const liveNodes: FGNode[] = fg.graphData().nodes;

      preDragPins.current.clear();
      for (const n of liveNodes) {
        preDragPins.current.set(n.id, { fx: n.fx, fy: n.fy });
        if (!neighbors.has(n.id)) {
          n.fx = n.x;
          n.fy = n.y;
        }
      }
    },
    [getNeighborIds],
  );

  const handleNodeDragEnd = useCallback(
    (node: FGNode) => {
      const fg = fgRef.current;
      if (!fg) { dragNodeRef.current = null; return; }
      const liveNodes: FGNode[] = fg.graphData().nodes;

      for (const n of liveNodes) {
        if (n.id === node.id) {
          n.fx = n.x;
          n.fy = n.y;
          continue;
        }
        const pre = preDragPins.current.get(n.id);
        if (pre) {
          n.fx = pre.fx;
          n.fy = pre.fy;
        }
      }
      preDragPins.current.clear();
      dragNodeRef.current = null;
    },
    [],
  );

  const handleResetView = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const liveNodes: FGNode[] = fg.graphData().nodes;
    for (const n of liveNodes) {
      n.fx = undefined;
      n.fy = undefined;
    }
    fg.d3ReheatSimulation();
    setTimeout(() => fg.zoomToFit(400, 60), 300);
  }, []);

  const handleNodeClick = useCallback(
    (node: FGNode) => {
      onSelectNode(node.id === selectedNodeId ? null : node.id);
    },
    [onSelectNode, selectedNodeId],
  );

  const handleBackgroundClick = useCallback(() => {
    onSelectNode(null);
    setContextMenu(null);
  }, [onSelectNode]);

  const handleNodeRightClick = useCallback(
    (node: FGNode, event: MouseEvent) => {
      event.preventDefault();
      const el = containerRef.current as unknown as HTMLElement;
      const rect = el?.getBoundingClientRect();
      const x = event.clientX - (rect?.left ?? 0);
      const y = event.clientY - (rect?.top ?? 0);
      setContextMenu({ x, y, nodeId: node.id, title: node.title });
    },
    [],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      setContextMenu(null);
    };
    window.addEventListener('click', dismiss);
    window.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('click', dismiss);
      window.removeEventListener('keydown', dismiss);
    };
  }, [contextMenu]);

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

  if (!ForceGraph2D) return null;

  return (
    <View ref={containerRef} style={{ width: containerWidth, height: containerHeight, position: 'relative' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData as any}
        width={containerWidth}
        height={containerHeight}
        backgroundColor={colors.surfaceCanvas}
        nodeId="id"
        nodeCanvasObject={drawNode as any}
        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
          const count = connectionCount.get(node.id) ?? 0;
          const r = BASE_NODE_RADIUS + Math.min(count * 1.5, 8);
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r + 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkCanvasObject={drawLink as any}
        linkSource="sourceId"
        linkTarget="targetId"
        onNodeClick={handleNodeClick as any}
        onNodeHover={(node: any) => setHoveredNodeId(node?.id ?? null)}
        onNodeRightClick={handleNodeRightClick as any}
        onBackgroundClick={handleBackgroundClick}
        onNodeDrag={handleNodeDrag as any}
        onNodeDragEnd={handleNodeDragEnd as any}
        cooldownTicks={80}
        enableNodeDrag
        minZoom={0.3}
        maxZoom={6}
      />

      {contextMenu && onHideNode ? (
        <View
          style={[
            styles.contextMenu,
            { left: contextMenu.x, top: contextMenu.y },
          ]}
        >
          <Pressable
            style={styles.contextMenuItem}
            onPress={() => {
              onHideNode(contextMenu.nodeId);
              setContextMenu(null);
            }}
          >
            <Icon name="visibility-off" size={16} color={colors.onSurfaceVariant} />
            <Text variant="body-sm" style={{ color: colors.onSurface }}>
              Hide from web
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Reset view button */}
      <Pressable
        onPress={handleResetView}
        style={styles.resetBtn}
        {...{ title: 'Reset view' } as any}
      >
        <Icon name="center-focus-strong" size={18} color={colors.onSurfaceVariant} />
      </Pressable>

      {/* Legend panel */}
      <View style={styles.legendContainer}>
        <Pressable
          onPress={() => setLegendOpen((v) => !v)}
          style={styles.legendToggle}
        >
          <Icon name="info" size={14} color={colors.onSurfaceVariant} />
          <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
            {legendOpen ? 'Legend' : 'Legend'}
          </Text>
          <Icon
            name={legendOpen ? 'expand-more' : 'chevron-right'}
            size={14}
            color={colors.outline}
          />
        </Pressable>
        {legendOpen ? (
          <View style={styles.legendBody}>
            <Text variant="label-sm" style={{ color: colors.outline, marginBottom: 4 }}>
              NODES
            </Text>
            {Object.entries(KIND_COLOR).filter(([k]) => !['organization', 'religion', 'player_character'].includes(k)).map(([kind, clr]) => (
              <View key={kind} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: clr }]} />
                <Text variant="body-sm" style={{ color: colors.onSurfaceVariant }}>
                  {KIND_LABEL[kind] ?? kind}
                </Text>
              </View>
            ))}

            <Text variant="label-sm" style={{ color: colors.outline, marginTop: 8, marginBottom: 4 }}>
              EDGES
            </Text>
            {(['manual', 'structural', 'mention'] as EdgeSource[]).map((src) => {
              const s = EDGE_STYLE[src];
              return (
                <View key={src} style={styles.legendRow}>
                  <View style={styles.legendLineBox}>
                    <View
                      style={[
                        styles.legendLine,
                        {
                          backgroundColor: src === 'mention' ? 'transparent' : s.color,
                          borderBottomColor: src === 'mention' ? s.color : 'transparent',
                          borderBottomWidth: src === 'mention' ? 1.5 : 0,
                          borderStyle: src === 'mention' ? 'dashed' : 'solid',
                          height: src === 'mention' ? 0 : s.width,
                        },
                      ]}
                    />
                  </View>
                  <Text variant="body-sm" style={{ color: colors.onSurfaceVariant }}>
                    {EDGE_SOURCE_LABEL[src]}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
  contextMenu: {
    position: 'absolute',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    paddingVertical: 4,
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 100,
  },
  contextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  resetBtn: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  legendContainer: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  legendToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  legendBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
    paddingTop: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLineBox: {
    width: 18,
    height: 10,
    justifyContent: 'center',
  },
  legendLine: {
    width: 18,
  },
});
