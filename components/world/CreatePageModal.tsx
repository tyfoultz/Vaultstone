import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createPage } from '@vaultstone/api';
import { getLatestVersion, getTemplate, listTemplates } from '@vaultstone/content';
import {
  filterPagesBySection,
  selectSectionsForWorld,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { PageKind, TemplateKey, WorldPage } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

import { toMaterialIcon, ACCENT_SWATCH } from './helpers';
import { worldPageHref } from './worldHref';

type Props = {
  worldId: string;
  sectionId: string;
  parentPageId?: string | null;
  onClose: () => void;
  onCreated?: (page: WorldPage) => void;
};

const TEMPLATE_OPTIONS: TemplateKey[] = ['locations', 'npcs', 'factions', 'lore', 'players', 'timeline', 'blank'];

export function CreatePageModal({
  worldId,
  sectionId,
  parentPageId,
  onClose,
  onCreated,
}: Props) {
  const router = useRouter();
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const section = useMemo(
    () => sections.find((sec) => sec.id === sectionId),
    [sections, sectionId],
  );
  const rawPages = usePagesStore((s) => s.byWorldId[worldId]);
  const parentTitle = useMemo(() => {
    if (!parentPageId) return null;
    return (rawPages ?? []).find((p) => p.id === parentPageId)?.title ?? null;
  }, [rawPages, parentPageId]);
  const nextSortOrder = useMemo(() => {
    const sectionPages = filterPagesBySection(rawPages, sectionId);
    const siblings = sectionPages.filter(
      (p) => (p.parent_page_id ?? null) === (parentPageId ?? null),
    );
    return (siblings.at(-1)?.sort_order ?? -1) + 1;
  }, [rawPages, sectionId, parentPageId]);
  const addPage = usePagesStore((s) => s.addPage);

  const sectionTemplate = useMemo(
    () => (section ? getTemplate(section.template_key) : null),
    [section],
  );

  const sectionKey = section?.template_key ?? 'blank';

  const [selectedTemplateKey, setSelectedTemplateKey] = useState<TemplateKey>(
    sectionKey,
  );
  const selectedTemplate = useMemo(
    () => getTemplate(selectedTemplateKey),
    [selectedTemplateKey],
  );

  const templateChoices = useMemo(() => {
    const all = listTemplates().filter((t) => TEMPLATE_OPTIONS.includes(t.key));
    // Ensure the section's own template is first if it's in the list
    const sorted = [...all].sort((a, b) => {
      if (a.key === sectionKey) return -1;
      if (b.key === sectionKey) return 1;
      return 0;
    });
    return sorted;
  }, [sectionKey]);

  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!section || !sectionTemplate) return null;

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Page title is required.');
      return;
    }
    if (!section) return;
    setSubmitting(true);
    setError('');
    const visibleToPlayers = section.force_hidden_from_players
      ? false
      : section.default_pages_visible;
    const { data, error: err } = await createPage({
      worldId,
      sectionId,
      parentPageId: parentPageId ?? null,
      title,
      pageKind: selectedTemplate.defaultPageKind,
      templateKey: selectedTemplateKey,
      templateVersion: getLatestVersion(selectedTemplateKey),
      visibleToPlayers,
      sortOrder: nextSortOrder,
    });
    setSubmitting(false);
    if (err || !data) {
      setError(err?.message ?? 'Failed to create page.');
      return;
    }
    addPage(data as WorldPage);
    if (onCreated) onCreated(data as WorldPage);
    onClose();
    router.push(worldPageHref(worldId, (data as WorldPage).id));
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">
                    {parentTitle ? `Sub-page of ${parentTitle}` : `New page · ${section?.name ?? ''}`}
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="serif-display"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    What are you adding?
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                <Input
                  label="Title"
                  placeholder="The Drunken Griffin"
                  value={title}
                  onChangeText={setTitle}
                  autoFocus
                />

                {templateChoices.length > 1 ? (
                  <View style={{ gap: spacing.xs }}>
                    <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                      Page type
                    </Text>
                    <View style={styles.chipRow}>
                      {templateChoices.map((t) => {
                        const active = selectedTemplateKey === t.key;
                        const swatch = ACCENT_SWATCH[t.accentToken];
                        const tint = swatch?.fg ?? colors.primary;
                        const iconName = toMaterialIcon(t.icon);
                        return (
                          <Pressable
                            key={t.key}
                            onPress={() => setSelectedTemplateKey(t.key)}
                            style={[
                              styles.selectChip,
                              active && { backgroundColor: tint + '18', borderColor: tint + '66' },
                            ]}
                          >
                            <Icon
                              name={iconName as React.ComponentProps<typeof Icon>['name']}
                              size={14}
                              color={active ? tint : colors.onSurfaceVariant}
                            />
                            <Text
                              variant="label-sm"
                              weight={active ? 'semibold' : 'regular'}
                              style={{ color: active ? tint : colors.onSurfaceVariant }}
                            >
                              {t.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label="Create page"
                  onPress={handleSubmit}
                  loading={submitting}
                />
              </View>
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panelWrapper: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  selectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  selectChipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
