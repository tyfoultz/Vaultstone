import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { getWorldImageSignedUrlById, type MapPin } from '@vaultstone/api';
import type { WorldPage } from '@vaultstone/types';
import { Card, GhostButton, GradientButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

import { PAGE_KIND_LABEL } from '../helpers';

type Props = {
  pin: MapPin;
  page: WorldPage;
  isOwner: boolean;
  onClose: () => void;
  onOpenPage: (pageId: string) => void;
  onEditPin: () => void;
};

export function PinPreviewPopup({ pin, page, isOwner, onClose, onOpenPage, onEditPin }: Props) {
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

  const role = typeof fields.role === 'string' ? fields.role : '';
  const species = typeof fields.species === 'string' ? fields.species : '';
  const status = typeof fields.status === 'string' ? fields.status : '';
  const disposition = typeof fields.disposition === 'string' ? fields.disposition : '';
  const bodySnippet = (page.body_text ?? '').slice(0, 200);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? page.page_kind;

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <Card tier="high" padding="lg" style={styles.card}>
        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
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
              {role ? (
                <Text variant="body-sm" style={{ color: colors.onSurfaceVariant }}>{role}</Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>

          {/* Meta chips */}
          {(species || status || disposition) ? (
            <View style={styles.chips}>
              {species ? <Chip label={species} /> : null}
              {status ? <Chip label={status} /> : null}
              {disposition ? <Chip label={disposition} /> : null}
            </View>
          ) : null}

          {/* Body snippet */}
          {bodySnippet ? (
            <Text
              variant="body-sm"
              style={styles.bodySnippet}
              numberOfLines={5}
            >
              {bodySnippet}{(page.body_text ?? '').length > 200 ? '…' : ''}
            </Text>
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

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>{label}</Text>
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
    maxWidth: 360,
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  bodySnippet: {
    marginTop: spacing.md,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
    justifyContent: 'flex-end',
  },
});
