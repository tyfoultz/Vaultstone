import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'react-native';
import { getWorldImageSignedUrlById } from '@vaultstone/api';
import type { WorldPage } from '@vaultstone/types';
import { Card, GhostButton, GradientButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { PAGE_KIND_LABEL } from '../helpers';
import { EDGE_STYLE, KIND_COLOR, type RelationEdge, type GraphNode } from './constants';

type Props = {
  node: GraphNode;
  page: WorldPage;
  connectedEdges: RelationEdge[];
  nodeById: Map<string, GraphNode>;
  onClose: () => void;
  onOpenPage: (pageId: string) => void;
};

export function NodeDetailCard({ node, page, connectedEdges, nodeById, onClose, onOpenPage }: Props) {
  const fields = (page.structured_fields as Record<string, unknown>) ?? {};
  const portraitImageId = typeof fields.__portrait_image_id === 'string' ? fields.__portrait_image_id : null;
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!portraitImageId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await getWorldImageSignedUrlById(portraitImageId);
      if (!cancelled && data) setPortraitUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [portraitImageId]);

  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? page.page_kind;

  return (
    <Card tier="high" padding="lg" style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        {portraitUrl ? (
          <Image source={{ uri: portraitUrl }} style={styles.portrait} resizeMode="cover" />
        ) : (
          <View style={[styles.portraitPlaceholder, { borderColor: node.color + '55' }]}>
            <Icon name={node.iconName as React.ComponentProps<typeof Icon>['name']} size={18} color={node.color} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <View style={[styles.kindBadge, { backgroundColor: node.color + '22', borderColor: node.color + '44' }]}>
            <Text variant="label-sm" style={{ color: node.color, fontSize: 10 }}>{kindLabel}</Text>
          </View>
          <Text variant="title-md" family="serif-display" weight="bold" numberOfLines={2}>
            {page.title}
          </Text>
        </View>
        <Pressable onPress={onClose} style={styles.closeBtn}>
          <Icon name="close" size={16} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* Connected edges */}
      {connectedEdges.length > 0 ? (
        <View style={styles.edgeList}>
          <MetaLabel size="sm" tone="muted" style={{ marginBottom: 4 }}>
            Connections ({connectedEdges.length})
          </MetaLabel>
          {connectedEdges.slice(0, 8).map((edge) => {
            const otherId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
            const otherNode = nodeById.get(otherId);
            if (!otherNode) return null;
            const edgeStyle = EDGE_STYLE[edge.edgeSource];
            const isOutgoing = edge.sourceId === node.id;
            const arrow = edge.directed ? (isOutgoing ? '→' : '←') : '↔';
            return (
              <Pressable
                key={edge.id}
                onPress={() => onOpenPage(otherId)}
                style={styles.edgeRow}
              >
                <View style={[styles.edgeIndicator, { backgroundColor: edgeStyle.color }]} />
                <Text variant="label-sm" style={{ color: colors.outline, marginRight: 4 }}>{arrow}</Text>
                <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>
                  {otherNode.title}
                </Text>
                <Text variant="label-sm" style={{ color: colors.outline }}>{edge.label}</Text>
              </Pressable>
            );
          })}
          {connectedEdges.length > 8 ? (
            <Text variant="label-sm" style={{ color: colors.outline, marginTop: 2 }}>
              +{connectedEdges.length - 8} more
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Actions */}
      <View style={styles.actions}>
        <GradientButton label="Open page" onPress={() => onOpenPage(node.id)} />
        <GhostButton label="Close" onPress={onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  portrait: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.outlineVariant + '44',
  },
  portraitPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  edgeList: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
    gap: 3,
  },
  edgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  edgeIndicator: {
    width: 12,
    height: 2,
    borderRadius: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'flex-end',
  },
});
