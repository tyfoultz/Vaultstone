import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  archiveWorld,
  getCampaigns,
  getCampaignsForWorld,
  getPage,
  linkWorldToCampaign,
  softDeleteWorld,
  unarchiveWorld,
  unlinkWorldFromCampaign,
  updateCampaign,
  updateWorld,
  uploadWorldCover,
  uploadWorldThumbnail,
} from '@vaultstone/api';
import { useAuthStore, useCurrentWorldStore, usePagesStore, useWorldsStore } from '@vaultstone/store';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  ImageCropModal,
  Input,
  MetaLabel,
  SectionHeader,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import type { Database, EraDefinition, TimelineCalendarSchema } from '@vaultstone/types';

type World = Database['public']['Tables']['worlds']['Row'];
type Campaign = Database['public']['Tables']['campaigns']['Row'];

type Props = {
  world: World;
  onClose: () => void;
};

export function WorldSettingsModal({ world, onClose }: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const storeUpdateWorld = useWorldsStore((s) => s.updateWorld);
  const storeRemoveWorld = useWorldsStore((s) => s.removeWorld);
  const patchWorld = useCurrentWorldStore((s) => s.patchWorld);
  const storeLinkedCampaigns = useCurrentWorldStore((s) => s.linkedCampaigns);
  const setStoreLinkedCampaigns = useCurrentWorldStore((s) => s.setLinkedCampaigns);

  const isOwner = user?.id === world.owner_user_id;

  const [name, setName] = useState(world.name);
  const [description, setDescription] = useState(world.description ?? '');

  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<'cover' | 'thumbnail'>('cover');
  const [calendarSchema, setCalendarSchema] = useState<TimelineCalendarSchema | null>(null);
  const initDate = (world.current_date_values ?? {}) as Record<string, string>;
  const [dateValues, setDateValues] = useState<Record<string, string>>(initDate);
  const [nextSessionAt, setNextSessionAt] = useState('');
  const [prepPageId, setPrepPageId] = useState<string | null>(null);
  const [prepPickerOpen, setPrepPickerOpen] = useState(false);
  const allPages = usePagesStore((s) => s.byWorldId[world.id]);
  const dateInputRef = useRef<TextInput>(null);

  const availablePages = useMemo(
    () => (allPages ?? []).filter((p) => !p.deleted_at),
    [allPages],
  );

  useEffect(() => {
    if (!user) return;
    Promise.all([getCampaigns(), getCampaignsForWorld(world.id)]).then(
      ([mine, linked]) => {
        const dmOnly = (mine.data ?? []).filter((c) => c.dm_user_id === user.id);
        setMyCampaigns(dmOnly);
        const linkedRows = (linked.data ?? []) as Array<{ campaign_id: string }>;
        setLinkedIds(linkedRows.map((r) => r.campaign_id));
        const linkedCampaign = dmOnly.find((c) => linkedRows.some((r) => r.campaign_id === c.id));
        if (linkedCampaign?.next_session_at) {
          setNextSessionAt(linkedCampaign.next_session_at.slice(0, 16));
        }
        if (linkedCampaign?.next_session_prep_page_id) {
          setPrepPageId(linkedCampaign.next_session_prep_page_id);
        }
      },
    );
  }, [user, world.id]);

  useEffect(() => {
    if (!world.primary_timeline_page_id) return;
    getPage(world.primary_timeline_page_id).then(({ data }) => {
      if (!data) return;
      const sf = data.structured_fields as Record<string, unknown> | null;
      const schema = sf?.__calendar_schema as TimelineCalendarSchema | undefined;
      if (schema?.eras) setCalendarSchema(schema);
    });
  }, [world.primary_timeline_page_id]);

  async function handleSaveAll() {
    if (!isOwner) return;
    setSaving(true);
    setError('');

    const worldPatch: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim() || null,
    };
    const hasDateValues = Object.values(dateValues).some((v) => v);
    worldPatch.current_date_values = hasDateValues ? dateValues : null;

    const { error: worldErr } = await updateWorld(world.id, worldPatch as Parameters<typeof updateWorld>[1]);
    if (worldErr) { setError(worldErr.message); setSaving(false); return; }

    storeUpdateWorld(world.id, worldPatch);
    patchWorld(worldPatch as Partial<World>);

    const linkedCampaign = myCampaigns.find((c) => linkedIds.includes(c.id));
    if (linkedCampaign) {
      const val = nextSessionAt ? new Date(nextSessionAt).toISOString() : null;
      const campPatch = {
        next_session_at: val,
        next_session_prep_page_id: prepPageId,
      };
      const { error: campErr } = await updateCampaign(linkedCampaign.id, campPatch);
      if (campErr) { setError(campErr.message); setSaving(false); return; }
      setStoreLinkedCampaigns(
        storeLinkedCampaigns.map((c) =>
          c.id === linkedCampaign.id ? { ...c, ...campPatch } : c,
        ),
      );
    }

    setSaving(false);
    onClose();
  }

  async function pickImage(target: 'cover' | 'thumbnail') {
    const isWeb = Platform.OS === 'web';
    const aspect: [number, number] = target === 'cover' ? [21, 7] : [3, 1];
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: !isWeb,
      aspect,
      quality: 0.5,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (isWeb) {
      setCropTarget(target);
      setCropUri(asset.uri);
    } else {
      await doUpload(target, asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  }

  async function handleCropConfirm(croppedUri: string) {
    const target = cropTarget;
    setCropUri(null);
    await doUpload(target, croppedUri, 'image/jpeg');
  }

  async function doUpload(target: 'cover' | 'thumbnail', uri: string, mime: string) {
    if (target === 'cover') {
      setUploadingCover(true);
      const { url } = await uploadWorldCover(world.id, uri, mime);
      setUploadingCover(false);
      if (url) {
        storeUpdateWorld(world.id, { cover_image_url: url });
        patchWorld({ cover_image_url: url });
      }
    } else {
      setUploadingThumb(true);
      const { url } = await uploadWorldThumbnail(world.id, uri, mime);
      setUploadingThumb(false);
      if (url) {
        storeUpdateWorld(world.id, { thumbnail_url: url });
        patchWorld({ thumbnail_url: url });
      }
    }
  }

  const selectedEra: EraDefinition | null =
    calendarSchema?.eras.find((e) => e.key === dateValues.era) ?? null;

  async function toggleCampaignLink(campaignId: string) {
    if (!isOwner) return;
    setWorking(true);
    setError('');
    const currentlyLinked = linkedIds.includes(campaignId);
    const { error: err } = currentlyLinked
      ? await unlinkWorldFromCampaign(world.id, campaignId)
      : await linkWorldToCampaign(world.id, campaignId);
    setWorking(false);
    if (err) {
      setError(err.message);
      return;
    }
    setLinkedIds((prev) =>
      currentlyLinked ? prev.filter((id) => id !== campaignId) : [...prev, campaignId],
    );
  }

  async function handleArchive() {
    if (!isOwner) return;
    setWorking(true);
    setError('');
    const { error: err } = world.is_archived
      ? await unarchiveWorld(world.id)
      : await archiveWorld(world.id);
    setWorking(false);
    if (err) {
      setError(err.message);
      return;
    }
    const patch = { is_archived: !world.is_archived };
    storeUpdateWorld(world.id, patch);
    patchWorld(patch);
  }

  async function handleDelete() {
    if (!isOwner) return;
    setWorking(true);
    setError('');
    const { error: err } = await softDeleteWorld(world.id);
    setWorking(false);
    if (err) {
      setError(err.message);
      return;
    }
    storeRemoveWorld(world.id);
    onClose();
    router.replace('/worlds');
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView showsVerticalScrollIndicator>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">World settings</MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="headline"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    {world.name}
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              {!isOwner ? (
                <Text
                  variant="body-sm"
                  tone="secondary"
                  style={{
                    marginTop: spacing.lg,
                    color: colors.onSurfaceVariant,
                  }}
                >
                  Only the world owner can edit these settings.
                </Text>
              ) : null}

              {/* Identity */}
              <View style={{ marginTop: spacing.lg }}>
                <SectionHeader title="Identity" />
                <View style={{ gap: spacing.md }}>
                  <Input
                    label="Name"
                    value={name}
                    onChangeText={setName}
                    editable={isOwner}
                  />
                  <Input
                    label="Description"
                    value={description}
                    onChangeText={setDescription}
                    editable={isOwner}
                    multiline
                    numberOfLines={3}
                    style={{ minHeight: 72, textAlignVertical: 'top' }}
                  />
                </View>
              </View>

              {/* Images */}
              {isOwner ? (
                <View style={{ marginTop: spacing.xl }}>
                  <SectionHeader title="Images" />
                  <View style={{ gap: spacing.md }}>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                        Banner image
                      </Text>
                      {world.cover_image_url ? (
                        <View style={styles.imagePreviewRow}>
                          <Image source={{ uri: world.cover_image_url }} style={styles.bannerPreview} resizeMode="cover" />
                          <GhostButton label="Change" icon="edit" onPress={() => pickImage('cover')} loading={uploadingCover} />
                        </View>
                      ) : (
                        <GhostButton label="Upload banner image" icon="add-a-photo" onPress={() => pickImage('cover')} loading={uploadingCover} />
                      )}
                    </View>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                        Sidebar image
                      </Text>
                      {world.thumbnail_url ? (
                        <View style={styles.imagePreviewRow}>
                          <Image source={{ uri: world.thumbnail_url }} style={styles.thumbPreview} resizeMode="cover" />
                          <GhostButton label="Change" icon="edit" onPress={() => pickImage('thumbnail')} loading={uploadingThumb} />
                        </View>
                      ) : (
                        <GhostButton label="Upload sidebar image" icon="add-a-photo" onPress={() => pickImage('thumbnail')} loading={uploadingThumb} />
                      )}
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Current in-world date */}
              {isOwner && calendarSchema ? (
                <View style={{ marginTop: spacing.xl }}>
                  <SectionHeader title="Current in-world date" />
                  <View style={{ gap: spacing.md }}>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                        Era
                      </Text>
                      <View style={styles.chipRow}>
                        {calendarSchema.eras.map((era) => (
                          <Pressable
                            key={era.key}
                            onPress={() => setDateValues((prev) => ({ ...prev, era: era.key }))}
                            style={[
                              styles.selectChip,
                              dateValues.era === era.key && styles.selectChipActive,
                            ]}
                          >
                            <Text
                              variant="label-md"
                              weight="semibold"
                              uppercase
                              style={{
                                color: dateValues.era === era.key ? colors.primary : colors.onSurfaceVariant,
                                letterSpacing: 1,
                              }}
                            >
                              {era.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                    {selectedEra ? (
                      selectedEra.dateLevels.map((level) => (
                        <Input
                          key={level.key}
                          label={level.label}
                          value={dateValues[level.key] ?? ''}
                          onChangeText={(v) => setDateValues((prev) => ({ ...prev, [level.key]: v }))}
                          placeholder={level.type === 'number' ? '0' : level.options?.[0] ?? ''}
                        />
                      ))
                    ) : null}
                    {world.current_date_values ? (
                      <GhostButton
                        label="Clear date"
                        icon="clear"
                        tone="neutral"
                        onPress={() => setDateValues({})}
                      />
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* Next session */}
              {isOwner && linkedIds.length > 0 ? (
                <View style={{ marginTop: spacing.xl }}>
                  <SectionHeader title="Next session" />
                  <View style={{ gap: spacing.md }}>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                        Scheduled date & time
                      </Text>
                      <View style={styles.datePickerWrapper}>
                        <View style={styles.datePickerBtn} pointerEvents="none">
                          <Icon name="event" size={18} color={nextSessionAt ? colors.primary : colors.onSurfaceVariant} />
                          <Text
                            variant="body-md"
                            style={{ color: nextSessionAt ? colors.onSurface : colors.onSurfaceVariant, flex: 1 }}
                          >
                            {nextSessionAt
                              ? new Date(nextSessionAt).toLocaleString(undefined, {
                                  weekday: 'short', month: 'short', day: 'numeric',
                                  hour: 'numeric', minute: '2-digit',
                                })
                              : 'Pick a date…'}
                          </Text>
                        </View>
                        {Platform.OS === 'web' ? (
                          <TextInput
                            ref={dateInputRef}
                            value={nextSessionAt}
                            onChangeText={setNextSessionAt}
                            style={styles.dateInputOverlay}
                            {...{ type: 'datetime-local' } as any}
                          />
                        ) : null}
                        {nextSessionAt ? (
                          <Pressable onPress={() => setNextSessionAt('')} hitSlop={8} style={styles.dateClearBtn}>
                            <Icon name="close" size={16} color={colors.onSurfaceVariant} />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                    <View style={{ gap: spacing.xs }}>
                      <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                        Prep notes page
                      </Text>
                      <Pressable onPress={() => setPrepPickerOpen(!prepPickerOpen)} style={styles.prepPageSelector}>
                        <Icon name="description" size={16} color={prepPageId ? colors.primary : colors.onSurfaceVariant} />
                        <Text
                          variant="body-sm"
                          style={{ color: prepPageId ? colors.primary : colors.onSurfaceVariant, flex: 1 }}
                          numberOfLines={1}
                        >
                          {prepPageId
                            ? availablePages.find((p) => p.id === prepPageId)?.title ?? 'Selected page'
                            : 'Auto-detect or choose a page…'}
                        </Text>
                        <Icon name={prepPickerOpen ? 'expand-less' : 'expand-more'} size={18} color={colors.onSurfaceVariant} />
                      </Pressable>
                      {prepPickerOpen ? (
                        <ScrollView style={styles.prepPageList} nestedScrollEnabled>
                          <Pressable
                            onPress={() => { setPrepPageId(null); setPrepPickerOpen(false); }}
                            style={[styles.prepPageItem, !prepPageId && styles.prepPageItemActive]}
                          >
                            <Text variant="body-sm" style={{ color: !prepPageId ? colors.primary : colors.onSurface }}>
                              Auto-detect from title
                            </Text>
                          </Pressable>
                          {availablePages.map((p) => (
                            <Pressable
                              key={p.id}
                              onPress={() => { setPrepPageId(p.id); setPrepPickerOpen(false); }}
                              style={[styles.prepPageItem, prepPageId === p.id && styles.prepPageItemActive]}
                            >
                              <Text
                                variant="body-sm"
                                numberOfLines={1}
                                style={{ color: prepPageId === p.id ? colors.primary : colors.onSurface }}
                              >
                                {p.title}
                              </Text>
                            </Pressable>
                          ))}
                        </ScrollView>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Linked campaigns */}
              {isOwner ? (
                <View style={{ marginTop: spacing.xl }}>
                  <SectionHeader title="Linked campaigns" />
                  {myCampaigns.length === 0 ? (
                    <Text
                      variant="body-sm"
                      tone="secondary"
                      style={{ color: colors.onSurfaceVariant }}
                    >
                      You don't run any campaigns yet.
                    </Text>
                  ) : (
                    <View style={styles.chipRow}>
                      {myCampaigns.map((c) => {
                        const selected = linkedIds.includes(c.id);
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => toggleCampaignLink(c.id)}
                            disabled={working}
                            style={[
                              styles.selectChip,
                              selected && styles.selectChipActive,
                            ]}
                          >
                            {selected ? (
                              <Icon name="check" size={14} color={colors.primary} />
                            ) : (
                              <Icon name="add" size={14} color={colors.onSurfaceVariant} />
                            )}
                            <Text
                              variant="label-md"
                              weight="semibold"
                              uppercase
                              style={{
                                color: selected ? colors.primary : colors.onSurfaceVariant,
                                letterSpacing: 1,
                              }}
                            >
                              {c.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : null}

              {/* Lifecycle */}
              {isOwner ? (
                <View style={{ marginTop: spacing.xl }}>
                  <SectionHeader title="Lifecycle" />
                  <View style={{ gap: spacing.sm }}>
                    <GhostButton
                      label={world.is_archived ? 'Unarchive world' : 'Archive world'}
                      icon={world.is_archived ? 'unarchive' : 'archive'}
                      onPress={handleArchive}
                      loading={working && !confirmDelete}
                    />
                    {!confirmDelete ? (
                      <GhostButton
                        label="Delete world"
                        icon="delete-outline"
                        onPress={() => setConfirmDelete(true)}
                        tone="neutral"
                        style={{ borderColor: colors.hpDanger + '66' }}
                      />
                    ) : (
                      <View style={styles.confirmRow}>
                        <Text
                          variant="body-sm"
                          style={{ color: colors.hpDanger, flex: 1 }}
                        >
                          Move this world to Recently Deleted?
                        </Text>
                        <GhostButton
                          label="Cancel"
                          onPress={() => setConfirmDelete(false)}
                        />
                        <GradientButton
                          label="Confirm"
                          onPress={handleDelete}
                          loading={working}
                        />
                      </View>
                    )}
                  </View>
                </View>
              ) : null}

              {error ? (
                <Text
                  variant="body-sm"
                  style={{ color: colors.hpDanger, marginTop: spacing.md }}
                >
                  {error}
                </Text>
              ) : null}

              {/* Save all */}
              {isOwner ? (
                <View style={{ marginTop: spacing.xl, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.outlineVariant + '22' }}>
                  <GradientButton
                    label="Save changes"
                    icon="check"
                    onPress={handleSaveAll}
                    loading={saving}
                    fullWidth
                  />
                </View>
              ) : null}
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
      {cropUri ? (
        <ImageCropModal
          visible
          imageUri={cropUri}
          aspect={cropTarget === 'cover' ? [21, 7] : [3, 1]}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropUri(null)}
        />
      ) : null}
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
    overflow: 'hidden',
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    maxHeight: '100%',
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
  },
  selectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bannerPreview: {
    flex: 1,
    height: 64,
    borderRadius: radius.lg,
  },
  thumbPreview: {
    width: 120,
    height: 40,
    borderRadius: radius.lg,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  datePickerWrapper: {
    position: 'relative',
  },
  dateInputOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
  },
  dateClearBtn: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 2,
  },
  prepPageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  prepPageList: {
    maxHeight: 200,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainerHigh,
    overflow: 'hidden',
  },
  prepPageItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  prepPageItemActive: {
    backgroundColor: colors.primaryContainer + '33',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hpDanger + '55',
    backgroundColor: colors.errorContainer + '22',
    flexWrap: 'wrap',
  },
});
