import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createMap, uploadMapImage, type WorldMap } from '@vaultstone/api';
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

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

type PreparedAsset = {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
  fileName: string;
};

type Props = {
  worldId: string;
  ownerPageId?: string | null;
  onClose: () => void;
  onUploaded: (map: WorldMap) => void;
};

// Native variant — picks an image via expo-image-picker, validates it
// client-side (<= 20 MB, allowed MIME), and streams the binary up via
// fetch(uri).blob() — the same pattern the campaign cover uploader uses.
export function MapUploadModal({ worldId, ownerPageId, onClose, onUploaded }: Props) {
  const [asset, setAsset] = useState<PreparedAsset | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handlePick() {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    const mimeType = picked.mimeType ?? 'image/jpeg';
    const fileSize = picked.fileSize ?? 0;
    if (!ALLOWED_MIME.includes(mimeType)) {
      setError('Upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (fileSize && fileSize > MAX_BYTES) {
      setError(`File is too large (${(fileSize / 1024 / 1024).toFixed(1)} MB). Cap is 20 MB.`);
      return;
    }
    const fileName = picked.fileName ?? `map-${Date.now()}.jpg`;
    const prepared: PreparedAsset = {
      uri: picked.uri,
      width: picked.width,
      height: picked.height,
      fileSize,
      mimeType,
      fileName,
    };
    setAsset(prepared);
    if (!label) setLabel(fileName.replace(/\.[^.]+$/, ''));
  }

  async function handleSubmit() {
    if (!asset) {
      setError('Choose an image first.');
      return;
    }
    if (!label.trim()) {
      setError('Label is required.');
      return;
    }
    setSubmitting(true);
    setError('');

    const mapId = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sanitized = asset.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${sanitized}`;

    let body: Blob;
    try {
      const response = await fetch(asset.uri);
      body = await response.blob();
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : 'Could not read image.');
      return;
    }

    const byteSize = asset.fileSize > 0 ? asset.fileSize : body.size;
    if (byteSize > MAX_BYTES) {
      setSubmitting(false);
      setError(`File is too large (${(byteSize / 1024 / 1024).toFixed(1)} MB). Cap is 20 MB.`);
      return;
    }

    const { error: uploadErr, key } = await uploadMapImage({
      worldId,
      mapId,
      filename,
      body,
      contentType: asset.mimeType,
    });
    if (uploadErr) {
      setSubmitting(false);
      setError(uploadErr.message ?? 'Upload failed.');
      return;
    }

    const { data, error: insertErr } = await createMap({
      id: mapId,
      world_id: worldId,
      owner_page_id: ownerPageId ?? null,
      label: label.trim(),
      image_key: key,
      image_width: asset.width,
      image_height: asset.height,
      aspect_ratio: asset.width / asset.height,
      byte_size: byteSize,
    });
    setSubmitting(false);
    if (insertErr || !data) {
      setError(insertErr?.message ?? 'Could not save map.');
      return;
    }
    onUploaded(data as WorldMap);
    onClose();
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">Upload map</MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="serif-display"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    Add a new map image
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                <View>
                  <MetaLabel size="sm">Image</MetaLabel>
                  <Pressable onPress={handlePick} style={styles.dropTarget}>
                    {asset ? (
                      <Text variant="body-md" numberOfLines={1}>
                        {asset.fileName} · {asset.width} × {asset.height}
                      </Text>
                    ) : (
                      <Text variant="body-md" tone="secondary">
                        Tap to choose a JPEG, PNG, or WebP (≤ 20 MB)
                      </Text>
                    )}
                  </Pressable>
                </View>

                <Input
                  label="Label"
                  placeholder="The Silvermarches"
                  value={label}
                  onChangeText={setLabel}
                />
              </View>

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label="Upload"
                  onPress={handleSubmit}
                  loading={submitting}
                  disabled={!asset}
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
  dropTarget: {
    padding: spacing.md,
    marginTop: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant + '88',
    backgroundColor: colors.surfaceContainerLowest,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
