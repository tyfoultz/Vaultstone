import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } = require('d3-force') as {
  forceCenter: (x?: number, y?: number) => any;
  forceCollide: (radius?: number) => any;
  forceLink: (links?: any[]) => any;
  forceManyBody: () => any;
  forceSimulation: (nodes?: any[]) => any;
};

import {
  BASE_NODE_RADIUS,
  EDGE_STYLE,
  KIND_COLOR,
  KIND_LABEL,
  type EdgeSource,
  type GraphNode,
  type RelationEdge,
} from './constants';

type Props = {
  nodes?: GraphNode[];
  edges?: RelationEdge[];
  nodeById?: Map<string, GraphNode>;
  visibleKinds?: Set<string>;
  visibleEdgeSources?: Set<EdgeSource>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
  onDoubleClickNode?: (nodeId: string) => void;
  onHideNode?: (nodeId: string) => void;
  containerWidth?: number;
  containerHeight?: number;
};

type SimNode = GraphNode & { x: number; y: number; vx?: number; vy?: number };
type SimLink = { source: SimNode; target: SimNode; edge: RelationEdge };

export function RelationWeb({
  nodes = [],
  edges = [],
  visibleKinds,
  visibleEdgeSources,
  selectedNodeId,
  onSelectNode,
  containerWidth = 400,
  containerHeight = 600,
}: Props) {
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simLinks, setSimLinks] = useState<SimLink[]>([]);
  const simRef = useRef<ReturnType<typeof forceSimulation> | null>(null);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const filteredNodes = useMemo(() => {
    if (!visibleKinds) return nodes;
    return nodes.filter((n) => visibleKinds.has(n.pageKind));
  }, [nodes, visibleKinds]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    let e = edges.filter((ed) => nodeIds.has(ed.sourceId) && nodeIds.has(ed.targetId));
    if (visibleEdgeSources) {
      e = e.filter((ed) => visibleEdgeSources.has(ed.edgeSource));
    }
    return e;
  }, [edges, filteredNodes, visibleEdgeSources]);

  useEffect(() => {
    if (filteredNodes.length === 0) {
      setSimNodes([]);
      setSimLinks([]);
      return;
    }

    const sNodes: SimNode[] = filteredNodes.map((n) => ({
      ...n,
      x: (Math.random() - 0.5) * containerWidth * 0.5,
      y: (Math.random() - 0.5) * containerHeight * 0.5,
    }));

    const nodeMap = new Map(sNodes.map((n) => [n.id, n]));

    const sLinks: SimLink[] = filteredEdges
      .map((e) => {
        const s = nodeMap.get(e.sourceId);
        const t = nodeMap.get(e.targetId);
        if (!s || !t) return null;
        return { source: s, target: t, edge: e };
      })
      .filter(Boolean) as SimLink[];

    const sim = forceSimulation(sNodes)
      .force('charge', forceManyBody().strength(-120))
      .force(
        'link',
        forceLink(sLinks)
          .id((d: SimNode) => d.id)
          .distance(80),
      )
      .force('center', forceCenter(0, 0).strength(0.1))
      .force('collide', forceCollide(BASE_NODE_RADIUS + 4))
      .alpha(1)
      .alphaDecay(0.02);

    sim.on('tick', () => {
      setSimNodes([...sNodes]);
      setSimLinks([...sLinks]);
    });

    simRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [filteredNodes, filteredEdges, containerWidth, containerHeight]);

  // Gestures
  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.max(0.2, Math.min(3, savedScale.value * e.scale));
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleNodePress = useCallback(
    (nodeId: string) => {
      onSelectNode?.(selectedNodeId === nodeId ? null : nodeId);
    },
    [onSelectNode, selectedNodeId],
  );

  if (nodes.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Icon name="hub" size={48} color={colors.outlineVariant} />
        <Text variant="body-md" tone="secondary" style={{ marginTop: spacing.sm }}>
          No pages to display in the relationship web.
        </Text>
      </View>
    );
  }

  const cx = containerWidth / 2;
  const cy = containerHeight / 2;

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.canvas, animatedStyle]}>
          <Svg
            width={containerWidth * 2}
            height={containerHeight * 2}
            viewBox={`${-containerWidth} ${-containerHeight} ${containerWidth * 2} ${containerHeight * 2}`}
          >
            {/* Edges */}
            {simLinks.map((link, i) => {
              const style = EDGE_STYLE[link.edge.edgeSource] ?? EDGE_STYLE.mention;
              return (
                <Line
                  key={`edge-${i}`}
                  x1={link.source.x}
                  y1={link.source.y}
                  x2={link.target.x}
                  y2={link.target.y}
                  stroke={style.color}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash.length > 0 ? style.dash.join(',') : undefined}
                  opacity={0.6}
                />
              );
            })}

            {/* Nodes */}
            {simNodes.map((node) => {
              const color = KIND_COLOR[node.pageKind] ?? colors.onSurfaceVariant;
              const isSelected = selectedNodeId === node.id;
              const r = BASE_NODE_RADIUS;

              return (
                <Circle
                  key={node.id}
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={isSelected ? color : color + '33'}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 1.5}
                  onPress={() => handleNodePress(node.id)}
                />
              );
            })}

            {/* Labels */}
            {simNodes.map((node) => {
              const color = KIND_COLOR[node.pageKind] ?? colors.onSurfaceVariant;
              const label =
                node.title.length > 12
                  ? node.title.slice(0, 11) + '…'
                  : node.title;
              return (
                <SvgText
                  key={`label-${node.id}`}
                  x={node.x}
                  y={node.y + BASE_NODE_RADIUS + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill={colors.onSurfaceVariant}
                  onPress={() => handleNodePress(node.id)}
                >
                  {label}
                </SvgText>
              );
            })}
          </Svg>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceCanvas,
  },
  canvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
