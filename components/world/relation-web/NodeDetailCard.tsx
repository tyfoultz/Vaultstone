import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'react-native';
import { getWorldImageSignedUrlById } from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import type { WorldPage } from '@vaultstone/types';
import { Card, GhostButton, GradientButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { PAGE_KIND_LABEL } from '../helpers';
import { EDGE_SOURCE_LABEL, EDGE_STYLE, KIND_COLOR, type RelationEdge, type GraphNode } from './constants';
import { useNodeDossier } from './useNodeDossier';

type Props = {
  node: GraphNode;
  page: WorldPage;
  connectedEdges: RelationEdge[];
  nodeById: Map<string, GraphNode>;
  worldId: string;
  onClose: () => void;
  onOpenPage: (pageId: string) => void;
};

export function NodeDetailCard({ node, page, connectedEdges, nodeById, worldId, onClose, onOpenPage }: Props) {
  const fields = (page.structured_fields as Record<string, unknown>) ?? {};
  const portraitImageId = typeof fields.__portrait_image_id === 'string' ? fields.__portrait_image_id : null;
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const { backlinks, timelineEvents, loading } = useNodeDossier(worldId, page.id);

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

  // Get template fields for structured properties display
  const templateFields = useMemo(() => {
    try {
      const tmpl = getTemplate(page.template_key as any, page.template_version);
      return tmpl.fields.filter((f) => {
        const val = fields[f.key];
        return val != null && val !== '' && !(Array.isArray(val) && val.length === 0);
      });
    } catch { return []; }
  }, [page.template_key, page.template_version, fields]);

  // Group edges by source
  const edgesBySource = useMemo(() => {
    const groups: Record<string, RelationEdge[]> = {};
    for (const e of connectedEdges) {
      (groups[e.edgeSource] ??= []).push(e);
    }
    return groups;
  }, [connectedEdges]);

  return (
    <Card tier="high" style={styles.card}>
      {/* Fixed header */}
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

      {/* Scrollable body */}
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.md }}>
        {/* Properties */}
        {templateFields.length > 0 ? (
          <View style={styles.section}>
            <MetaLabel size="sm" tone="muted" style={{ marginBottom: 4 }}>Properties</MetaLabel>
            {templateFields.map((f) => {
              const val = fields[f.key];
              const display = Array.isArray(val) ? (val as string[]).join(', ') : String(val);
              return (
                <View key={f.key} style={styles.propRow}>
                  <Text variant="label-sm" style={{ color: colors.outline, width: 80 }}>{f.label}</Text>
                  <Text variant="body-sm" style={{ flex: 1, color: colors.onSurface }} numberOfLines={1}>{display}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Relationships (grouped by source) */}
        {connectedEdges.length > 0 ? (
          <View style={styles.section}>
            <MetaLabel size="sm" tone="muted" style={{ marginBottom: 4 }}>
              Connections ({connectedEdges.length})
            </MetaLabel>
            {Object.entries(edgesBySource).map(([source, edges]) => (
              <View key={source} style={{ marginBottom: spacing.xs }}>
                <Text variant="label-sm" style={{ color: colors.outline, fontSize: 10, marginBottom: 2 }}>
                  {EDGE_SOURCE_LABEL[source as keyof typeof EDGE_SOURCE_LABEL] ?? source}
                </Text>
                {edges.map((edge) => {
                  const otherId = edge.sourceId === node.id ? edge.targetId : edge.sourceId;
                  const otherNode = nodeById.get(otherId);
                  if (!otherNode) return null;
                  const edgeStyle = EDGE_STYLE[edge.edgeSource];
                  const isOutgoing = edge.sourceId === node.id;
                  const arrow = edge.directed ? (isOutgoing ? '→' : '←') : '↔';
                  return (
                    <Pressable key={edge.id} onPress={() => onOpenPage(otherId)} style={styles.edgeRow}>
                      <View style={[styles.edgeIndicator, { backgroundColor: edgeStyle.color }]} />
                      <Text variant="label-sm" style={{ color: colors.outline, marginRight: 4 }}>{arrow}</Text>
                      <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>
                        {otherNode.title}
                      </Text>
                      <Text variant="label-sm" style={{ color: colors.outline }}>{edge.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        ) : null}

        {/* Mentioned By (backlinks) */}
        {loading ? (
          <MetaLabel size="sm" tone="muted" style={{ paddingVertical: spacing.sm }}>Loading…</MetaLabel>
        ) : backlinks.length > 0 ? (
          <View style={styles.section}>
            <MetaLabel size="sm" tone="muted" style={{ marginBottom: 4 }}>
              Mentioned By ({backlinks.length})
            </MetaLabel>
            {backlinks.slice(0, 12).map((bl) => (
              <Pressable key={bl.id} onPress={() => onOpenPage(bl.id)} style={styles.edgeRow}>
                <Icon name="description" size={14} color={colors.outline} />
                <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>
                  {bl.title}
                </Text>
                <Text variant="label-sm" style={{ color: colors.outline }}>
                  {PAGE_KIND_LABEL[bl.page_kind] ?? bl.page_kind}
                </Text>
              </Pressable>
            ))}
            {backlinks.length > 12 ? (
              <Text variant="label-sm" style={{ color: colors.outline, marginTop: 2 }}>
                +{backlinks.length - 12} more
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Timeline appearances */}
        {!loading && timelineEvents.length > 0 ? (
          <View style={styles.section}>
            <MetaLabel size="sm" tone="muted" style={{ marginBottom: 4 }}>
              Timeline ({timelineEvents.length})
            </MetaLabel>
            {timelineEvents.slice(0, 8).map((ev) => {
              const dateVals = ev.date_values as Record<string, string> | null;
              const eraLabel = dateVals?.era || dateVals?.Era || '';
              return (
                <View key={ev.id} style={styles.edgeRow}>
                  <Icon name="timeline" size={14} color={colors.cosmic} />
                  <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>
                    {ev.title}
                  </Text>
                  {eraLabel ? (
                    <Text variant="label-sm" style={{ color: colors.cosmic }}>{eraLabel}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

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
    width: 380,
    maxHeight: 520,
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
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
  body: {
    paddingHorizontal: spacing.lg,
    maxHeight: 340,
  },
  section: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 2,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
  },
});
