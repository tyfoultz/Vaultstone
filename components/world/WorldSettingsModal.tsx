import { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  archiveWorld,
  getCampaigns,
  getCampaignsForWorld,
  linkWorldToCampaign,
  softDeleteWorld,
  unarchiveWorld,
  unlinkWorldFromCampaign,
  updateWorld,
  uploadWorldCover,
  uploadWorldThumbnail,
} from '@vaultstone/api';
import { useAuthStore, useCurrentWorldStore, useWorldsStore } from '@vaultstone/store';
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
import type { Database } from '@vaultstone/types';

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
  const setActiveWorld = useCurrentWorldStore((s) => s.setActiveWorld);

  const isOwner = user?.id === world.owner_user_id;

  const [name, setName] = useState(world.name);
  const [description, setDescription] = useState(world.description ?? '');
  const [savingRename, setSavingRename] = useState(false);

  const [myCampaigns, setMyCampaigns] = useState<Campaign[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<'cover' | 'thumbnail'>('cover');

  useEffect(() => {
    if (!user) return;
    Promise.all([getCampaigns(), getCampaignsForWorld(world.id)]).then(
      ([mine, linked]) => {
        const dmOnly = (mine.data ?? []).filter((c) => c.dm_user_id === user.id);
        setMyCampaigns(dmOnly);
        const linkedRows = (linked.data ?? []) as Array<{ campaign_id: string }>;
        setLinkedIds(linkedRows.map((r) => r.campaign_id));
      },
    );
  }, [user, world.id]);

  async function handleRename() {
    if (!name.trim() || !isOwner) return;
    setSavingRename(true);
    setError('');
    const patch = {
      name: name.trim(),
      description: description.trim() || null,
    };
    const { error: err } = await updateWorld(world.id, patch);
    setSavingRename(false);
    if (err) {
      setError(err.message);
      return;
    }
    storeUpdateWorld(world.id, patch);
    setActiveWorld({ ...world, ...patch });
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
        setActiveWorld({ ...world, cover_image_url: url });
      }
    } else {
      setUploadingThumb(true);
      const { url } = await uploadWorldThumbnail(world.id, uri, mime);
      setUploadingThumb(false);
      if (url) {
        storeUpdateWorld(world.id, { thumbnail_url: url });
        setActiveWorld({ ...world, thumbnail_url: url });
      }
    }
  }

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
    setActiveWorld({ ...world, ...patch });
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
            <ScrollView>
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
                  {isOwner ? (
                    <GhostButton
                      label="Save changes"
                      onPress={handleRename}
                      loading={savingRename}
                    />
                  ) : null}
                </View>
              </View>

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
