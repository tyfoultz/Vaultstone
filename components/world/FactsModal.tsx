import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { updatePage } from '@vaultstone/api';
import { usePagesStore, useSectionsStore, selectSectionsForWorld } from '@vaultstone/store';
import type { Json, SectionTemplate, WorldPage } from '@vaultstone/types';
import { GhostButton, Icon, Input, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  visible: boolean;
  page: WorldPage;
  template: SectionTemplate;
  onClose: () => void;
  onSaveStateChange?: (state: SaveState) => void;
};

const EMPTY_PAGES: WorldPage[] = [];

export function FactsModal({ visible, page, template, onClose, onSaveStateChange }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    (page.structured_fields as Record<string, unknown>) ?? {},
  );
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pagesByWorld = usePagesStore((s) => s.byWorldId[page.world_id] ?? EMPTY_PAGES);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, page.world_id));

  const eraField = template.fields.find((f) => f.key === 'era');
  const timelinePages = useMemo(
    () => pagesByWorld.filter((p) => p.page_kind === 'timeline'),
    [pagesByWorld],
  );

  const currentEraId = typeof draft.era === 'string' ? draft.era : null;
  const noTimeline = currentEraId === null;

  const categoryTags = useMemo(
    () => (Array.isArray(draft.category) ? (draft.category as string[]) : []),
    [draft.category],
  );
  const [catDraft, setCatDraft] = useState('');

  const tags = useMemo(
    () => (Array.isArray(draft.tags) ? (draft.tags as string[]) : []),
    [draft.tags],
  );
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    setDraft((page.structured_fields as Record<string, unknown>) ?? {});
  }, [page.id, page.structured_fields]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    onSaveStateChange?.('saving');
    timerRef.current = setTimeout(async () => {
      const { data, error } = await updatePage(page.id, {
        structured_fields: draft as Json,
      });
      if (error || !data) {
        onSaveStateChange?.('error');
        return;
      }
      updatePageInStore(page.id, { structured_fields: data.structured_fields });
      onSaveStateChange?.('saved');
      dirtyRef.current = false;
    }, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft, page.id, onSaveStateChange, updatePageInStore]);

  function setField(key: string, value: unknown) {
    dirtyRef.current = true;
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function commitCategory() {
    const trimmed = catDraft.trim();
    if (!trimmed || categoryTags.includes(trimmed)) { setCatDraft(''); return; }
    setField('category', [...categoryTags, trimmed]);
    setCatDraft('');
  }

  function removeCategory(tag: string) {
    setField('category', categoryTags.filter((t) => t !== tag));
  }

  function commitTag() {
    const trimmed = tagDraft.trim();
    if (!trimmed || tags.includes(trimmed)) { setTagDraft(''); return; }
    setField('tags', [...tags, trimmed]);
    setTagDraft('');
  }

  function removeTag(tag: string) {
    setField('tags', tags.filter((t) => t !== tag));
  }

  if (template.fields.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <Icon name="info-outline" size={16} color={colors.primary} />
              <Text variant="title-md" family="serif-display" weight="bold">
                Facts
              </Text>
            </View>
            <GhostButton label="Done" onPress={onClose} />
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {/* Era */}
            {eraField ? (
              <View style={styles.section}>
                <MetaLabel size="sm">Era</MetaLabel>
                {noTimeline ? (
                  <Pressable
                    onPress={() => {
                      if (timelinePages.length > 0) setField('era', timelinePages[0].id);
                    }}
                    style={styles.noTimelineChip}
                  >
                    <Icon name="link-off" size={14} color={colors.outline} />
                    <Text variant="body-sm" style={{ color: colors.outline }}>
                      Not tied to a timeline
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.eraList}>
                    {timelinePages.map((tp) => {
                      const selected = currentEraId === tp.id;
                      const sectionName = sections.find((s) => s.id === tp.section_id)?.name ?? '';
                      return (
                        <Pressable
                          key={tp.id}
                          onPress={() => setField('era', selected ? null : tp.id)}
                          style={[styles.eraRow, selected && styles.eraRowActive]}
                        >
                          <Icon
                            name={selected ? 'check-circle' : 'radio-button-unchecked'}
                            size={16}
                            color={selected ? colors.primary : colors.outline}
                          />
                          <Text variant="body-sm" style={{ flex: 1, color: colors.onSurface }}>
                            {tp.title}
                          </Text>
                          {sectionName ? (
                            <Text variant="label-sm" style={{ color: colors.outline }}>
                              {sectionName}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => setField('era', null)}
                      style={[styles.eraRow, noTimeline && styles.eraRowActive]}
                    >
                      <Icon
                        name="link-off"
                        size={16}
                        color={colors.outline}
                      />
                      <Text variant="body-sm" style={{ color: colors.outline }}>
                        Remove timeline link
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            {/* Category */}
            <View style={styles.section}>
              <MetaLabel size="sm">Category</MetaLabel>
              <View style={styles.chipRow}>
                {categoryTags.map((tag) => (
                  <View key={tag} style={styles.chip}>
                    <Text variant="label-md" weight="semibold" uppercase style={styles.chipText}>
                      {tag}
                    </Text>
                    <Pressable onPress={() => removeCategory(tag)} style={styles.chipRemove}>
                      <Icon name="close" size={11} color={colors.outline} />
                    </Pressable>
                  </View>
                ))}
              </View>
              <Input
                placeholder="Add a category and press enter…"
                value={catDraft}
                onChangeText={setCatDraft}
                onSubmitEditing={commitCategory}
                onBlur={commitCategory}
                returnKeyType="done"
              />
            </View>

            {/* Tags */}
            <View style={styles.section}>
              <MetaLabel size="sm">Tags</MetaLabel>
              <View style={styles.chipRow}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.chip}>
                    <Text variant="label-md" style={{ color: colors.onSurfaceVariant }}>
                      {tag}
                    </Text>
                    <Pressable onPress={() => removeTag(tag)} style={styles.chipRemove}>
                      <Icon name="close" size={11} color={colors.outline} />
                    </Pressable>
                  </View>
                ))}
              </View>
              <Input
                placeholder="Add a tag and press enter…"
                value={tagDraft}
                onChangeText={setTagDraft}
                onSubmitEditing={commitTag}
                onBlur={commitTag}
                returnKeyType="done"
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  noTimelineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    backgroundColor: colors.surfaceContainer,
  },
  eraList: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  eraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  eraRowActive: {
    backgroundColor: colors.primaryContainer + '22',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.sm + 2,
    paddingRight: 4,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  chipText: {
    color: colors.onSurfaceVariant,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  chipRemove: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
