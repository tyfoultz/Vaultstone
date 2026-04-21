import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import {
  createWorldImage,
  getMyStorageUsage,
  uploadWorldImage,
} from '@vaultstone/api';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 1920;
const COMPRESS_QUALITY = 0.8;

type Props = {
  worldId: string;
  pageId: string;
  onInsert: (attrs: { imageId: string; alt: string; width: number; height: number }) => void;
  onClose: () => void;
};

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
}

async function readImageDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error('Could not read image'));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const dims = await readImageDims(file);
  let { w, h } = dims;

  const needsResize = w > MAX_DIMENSION || h > MAX_DIMENSION;
  const needsCompress = file.type !== 'image/jpeg' || needsResize;

  if (!needsCompress && file.size <= MAX_BYTES) {
    return { blob: file, width: w, height: h };
  }

  if (needsResize) {
    const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compression failed'))),
      'image/jpeg',
      COMPRESS_QUALITY,
    );
  });

  return { blob, width: w, height: h };
}

export function ImageUploadModal({ worldId, pageId, onInsert, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    if (!ALLOWED_MIME.includes(f.type)) {
      setError('Only JPEG, PNG, and WebP images are supported.');
      return;
    }
    if (f.size > MAX_BYTES * 2) {
      setError('Image exceeds 20MB. Please use a smaller file.');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');

    const usage = await getMyStorageUsage();
    if (usage.blocked) {
      setError('Storage limit reached (500MB). Delete unused images or maps to free space.');
      setUploading(false);
      return;
    }

    try {
      const { blob, width, height } = await compressImage(file);

      const imageId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const filename = sanitizeFilename(file.name);

      const { error: upErr } = await uploadWorldImage({
        worldId,
        imageId,
        filename,
        body: blob,
        contentType: 'image/jpeg',
      });

      if (upErr) {
        setError(upErr.message ?? 'Upload failed.');
        setUploading(false);
        return;
      }

      const imageKey = `${worldId}/${imageId}/${filename}`;
      const { data: row, error: rowErr } = await createWorldImage({
        world_id: worldId,
        page_id: pageId,
        image_key: imageKey,
        width,
        height,
        alt: alt.trim(),
        byte_size: blob.size,
        content_type: 'image/jpeg',
      });

      if (rowErr || !row) {
        setError(rowErr?.message ?? 'Failed to save image record.');
        setUploading(false);
        return;
      }

      onInsert({ imageId: row.id, alt: alt.trim(), width, height });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.modalWrap} onPress={(e) => e.stopPropagation()}>
          <Card tier="highest" padding="lg" style={styles.card}>
            <View style={styles.header}>
              <Icon name="image" size={20} color={colors.primary} />
              <Text variant="title-md" family="serif-display" weight="semibold">
                Insert Image
              </Text>
            </View>

            {preview ? (
              <View style={styles.previewWrap}>
                <img
                  src={preview}
                  alt="Preview"
                  style={{
                    maxWidth: '100%',
                    maxHeight: 240,
                    borderRadius: 8,
                    objectFit: 'contain',
                  }}
                />
              </View>
            ) : (
              <Pressable
                onPress={() => inputRef.current?.click()}
                style={styles.dropZone}
              >
                <Icon name="cloud-upload" size={32} color={colors.outlineVariant} />
                <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.sm }}>
                  Click to select an image
                </Text>
                <Text variant="label-sm" style={{ color: colors.outline, marginTop: spacing.xs }}>
                  JPEG, PNG, or WebP · max 10MB
                </Text>
              </Pressable>
            )}

            <input
              ref={inputRef as any}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFilePick as any}
              style={{ display: 'none' }}
            />

            {file ? (
              <View style={styles.altRow}>
                <MetaLabel size="sm" tone="muted">Alt text (optional)</MetaLabel>
                <input
                  type="text"
                  value={alt}
                  onChange={(e: any) => setAlt(e.target.value)}
                  placeholder="Describe the image…"
                  style={{
                    width: '100%',
                    background: colors.surfaceContainerLowest,
                    border: `1px solid ${colors.outlineVariant}55`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: colors.onSurface,
                    fontFamily: 'Manrope, system-ui, sans-serif',
                    fontSize: 14,
                    outline: 'none',
                    marginTop: 4,
                  }}
                />
              </View>
            ) : null}

            {error ? (
              <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.sm }}>
                {error}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <GhostButton label="Cancel" onPress={onClose} />
              {file ? (
                <GradientButton
                  label={uploading ? 'Uploading…' : 'Insert image'}
                  onPress={handleUpload}
                  disabled={uploading}
                />
              ) : (
                <GradientButton label="Choose file" onPress={() => inputRef.current?.click()} />
              )}
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalWrap: {
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dropZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  previewWrap: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  altRow: {
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
