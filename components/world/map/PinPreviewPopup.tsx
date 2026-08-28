import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { getWorldImageSignedUrlById, type MapPin } from '@vaultstone/api';
import type { Json, WorldPage } from '@vaultstone/types';
import { Card, GhostButton, GradientButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { PAGE_KIND_LABEL } from '../helpers';
import { pageRefLabel, resolvePageRef } from '../pageRefValue';

type CanvasBlock = { id: string; x: number; y: number; width: number; html: string };

type Props = {
  pin: MapPin;
  page: WorldPage;
  allPages: WorldPage[];
  isOwner: boolean;
  onClose: () => void;
  onOpenPage: (pageId: string) => void;
  onEditPin: () => void;
};

function fieldStr(fields: Record<string, unknown>, key: string): string {
  const v = fields[key];
  return typeof v === 'string' ? v : '';
}

function getCanvasSnippetHtml(body: Json): string | null {
  const raw = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>).__canvas_blocks
    : body;
  if (!Array.isArray(raw)) return null;
  const blocks = raw as CanvasBlock[];
  const textBlocks = blocks.filter((b) => b.html && b.html.trim().length > 0);
  if (textBlocks.length === 0) return null;
  textBlocks.sort((a, b) => a.y - b.y || a.x - b.x);
  return textBlocks[0].html;
}

function stripHtmlToText(html: string): string {
  const el = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (!el) return html.replace(/<[^>]*>/g, '');
  el.innerHTML = html;
  return el.textContent ?? '';
}

type KindFields = { label: string; value: string; icon?: string }[];

function getKindFields(page: WorldPage, fields: Record<string, unknown>, allPages: WorldPage[]): KindFields {
  switch (page.page_kind) {
    case 'location': {
      const out: KindFields = [];
      const t = fieldStr(fields, 'type');
      if (t) out.push({ label: 'Type', value: t, icon: 'category' });
      const gov = fieldStr(fields, 'governance');
      if (gov) out.push({ label: 'Ruler', value: gov, icon: 'account-balance' });
      const pop = fieldStr(fields, 'population');
      if (pop) out.push({ label: 'Population', value: pop, icon: 'groups' });
      const danger = fieldStr(fields, 'danger_level');
      if (danger) out.push({ label: 'Danger', value: danger, icon: 'warning' });
      const region = fieldStr(fields, 'region');
      if (region) out.push({ label: 'Region', value: region, icon: 'map' });
      return out;
    }
    case 'npc': {
      const out: KindFields = [];
      const role = fieldStr(fields, 'role');
      if (role) out.push({ label: 'Role', value: role, icon: 'badge' });
      const sp = fieldStr(fields, 'species');
      if (sp) out.push({ label: 'Species', value: sp, icon: 'pets' });
      const st = fieldStr(fields, 'status');
      if (st) out.push({ label: 'Status', value: st, icon: 'favorite' });
      const disp = fieldStr(fields, 'disposition');
      if (disp) out.push({ label: 'Disposition', value: disp, icon: 'mood' });
      return out;
    }
    case 'faction':
    case 'organization':
    case 'religion': {
      const out: KindFields = [];
      const doctrine = fieldStr(fields, 'doctrine');
      if (doctrine) out.push({ label: 'Doctrine', value: doctrine, icon: 'menu-book' });
      // Leader may be a linked NPC page or a name typed straight in.
      const leader = pageRefLabel(resolvePageRef(fields.leader, allPages));
      if (leader) out.push({ label: 'Leader', value: leader, icon: 'person' });
      const size = fieldStr(fields, 'size');
      if (size) out.push({ label: 'Size', value: size, icon: 'groups' });
      const stance = fieldStr(fields, 'stance');
      if (stance) out.push({ label: 'Stance', value: stance, icon: 'handshake' });
      return out;
    }
    default:
      return [];
  }
}

export function PinPreviewPopup({ pin, page, allPages, isOwner, onClose, onOpenPage, onEditPin }: Props) {
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
  const kindFields = useMemo(() => getKindFields(page, fields, allPages), [page, fields, allPages]);

  const canvasHtml = useMemo(() => getCanvasSnippetHtml(page.body as Json), [page.body]);
  const canvasText = useMemo(() => canvasHtml ? stripHtmlToText(canvasHtml).slice(0, 250) : null, [canvasHtml]);

  const mentionedPages = useMemo(() => {
    if (!page.body_refs || page.body_refs.length === 0) return [];
    const refs = page.body_refs;
    return allPages.filter((p) => refs.includes(p.id));
  }, [page.body_refs, allPages]);

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Card tier="high" padding="lg" style={styles.card}>
        <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            {portraitUrl ? (
              <Image source={{ uri: portraitUrl }} style={styles.portrait} resizeMode="cover" />
            ) : (
              <View style={styles.portraitPlaceholder}>
                <Icon name="article" size={20} color={colors.outline} />
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <MetaLabel size="sm" tone="accent">{kindLabel}</MetaLabel>
              <Text variant="title-md" family="serif-display" weight="bold" numberOfLines={2}>
                {page.title}
              </Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          {/* Kind-specific fields */}
          {kindFields.length > 0 ? (
            <View style={styles.fieldsGrid}>
              {kindFields.map((f) => (
                <View key={f.label} style={styles.fieldRow}>
                  {f.icon ? <Icon name={f.icon as React.ComponentProps<typeof Icon>['name']} size={13} color={colors.outline} /> : null}
                  <Text variant="label-sm" style={{ color: colors.outline }}>{f.label}</Text>
                  <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface, textAlign: 'right' }}>{f.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Canvas snippet */}
          {canvasText ? (
            <View style={styles.canvasSection}>
              <View style={styles.canvasBorder}>
                <Text variant="body-sm" numberOfLines={4} style={{ color: colors.onSurfaceVariant, lineHeight: 18 }}>
                  {canvasText}{canvasText.length >= 250 ? '…' : ''}
                </Text>
              </View>
            </View>
          ) : null}

          {/* @Mentions */}
          {mentionedPages.length > 0 ? (
            <View style={styles.mentionsSection}>
              <MetaLabel size="sm" tone="muted" style={{ marginBottom: 6 }}>Linked pages</MetaLabel>
              <View style={styles.mentionsList}>
                {mentionedPages.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => onOpenPage(p.id)}
                    style={styles.mentionChip}
                  >
                    <Text variant="label-sm" style={{ color: colors.primary }}>
                      @ {p.title}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Actions */}
          <View style={styles.actions}>
            <GradientButton label="Open page" onPress={() => onOpenPage(page.id)} />
            {isOwner ? <GhostButton label="Edit pin" onPress={onEditPin} /> : null}
          </View>
        </ScrollView>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  portrait: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.outlineVariant + '44',
  },
  portraitPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  fieldsGrid: {
    marginTop: spacing.md,
    gap: 4,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.outlineVariant + '22',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  canvasSection: {
    marginTop: spacing.md,
  },
  canvasBorder: {
    borderLeftWidth: 2,
    borderLeftColor: colors.primary + '66',
    paddingLeft: spacing.sm,
    paddingVertical: 2,
  },
  mentionsSection: {
    marginTop: spacing.md,
  },
  mentionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  mentionChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryContainer + '33',
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    justifyContent: 'flex-end',
  },
});
