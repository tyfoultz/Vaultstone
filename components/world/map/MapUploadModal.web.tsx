import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
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

type PreparedFile = {
  file: File;
  width: number;
  height: number;
};

type Props = {
  worldId: string;
  ownerPageId?: string | null;
  onClose: () => void;
  onUploaded: (map: WorldMap) => void;
};

// Reads natural dimensions from a browser File without a network round-trip.
// We resolve with dims so the modal can populate image_width / image_height
// on the world_maps row before the canvas mounts.
function readImageDims(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions.'));
    };
    img.src = url;
  });
}

export function MapUploadModal({ worldId, ownerPageId, onClose, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [prepared, setPrepared] = useState<PreparedFile | null>(null);
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_MIME.includes(file.type)) {
      setError('Upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Cap is 20 MB.`);
      return;
    }
    try {
      const dims = await readImageDims(file);
      setPrepared({ file, width: dims.width, height: dims.height });
      if (!label) setLabel(file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read image.');
    }
  }

  async function handleSubmit() {
    if (!prepared) {
      setError('Choose an image first.');
      return;
    }
    if (!label.trim()) {
      setError('Label is required.');
      return;
    }
    setSubmitting(true);
    setError('');

    const mapId = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sanitized = prepared.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${sanitized}`;

    const { error: uploadErr, key } = await uploadMapImage({
      worldId,
      mapId,
      filename,
      body: prepared.file,
      contentType: prepared.file.type,
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
      image_width: prepared.width,
      image_height: prepared.height,
      aspect_ratio: prepared.width / prepared.height,
      byte_size: prepared.file.size,
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
                <div style={{ marginTop: 8 }}>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFilePick}
                    style={{ display: 'none' }}
                  />
                  <Pressable
                    onPress={() => inputRef.current?.click()}
                    style={styles.dropTarget}
                  >
                    {prepared ? (
                      <Text variant="body-md" numberOfLines={1}>
                        {prepared.file.name} · {prepared.width} × {prepared.height}
                      </Text>
                    ) : (
                      <Text variant="body-md" tone="secondary">
                        Click to choose a JPEG, PNG, or WebP (≤ 20 MB)
                      </Text>
                    )}
                  </Pressable>
                </div>
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
                disabled={!prepared}
              />
            </View>
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
