import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform, Pressable } from 'react-native';
import { colors, spacing } from './tokens';

// react-easy-crop is web-only; lazy-import to avoid errors on native
let Cropper: React.ComponentType<any> | null = null;
if (Platform.OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Cropper = require('react-easy-crop').default;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AspectPreset = {
  label: string;
  aspect: [number, number];
};

interface Props {
  visible: boolean;
  imageUri: string;
  aspect?: [number, number];
  /** Preset buttons shown above the crop area so the user can switch
   *  aspect ratio. When omitted, the crop locks to `aspect`. */
  presets?: AspectPreset[];
  /** Where the cropped image will appear — shown as a hint below the crop area */
  usageHint?: string;
  onConfirm: (croppedUri: string, finalAspect?: [number, number]) => void;
  onCancel: () => void;
}

/** Draws the cropped region onto a canvas and returns a blob URL. */
async function getCroppedBlob(imageSrc: string, crop: CropArea): Promise<string> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(URL.createObjectURL(blob!));
    }, 'image/jpeg', 0.5);
  });
}

export function ImageCropModal({ visible, imageUri, aspect = [16, 9], presets, usageHint, onConfirm, onCancel }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [activeAspect, setActiveAspect] = useState<[number, number]>(aspect);

  const aspectRatio = activeAspect[0] / activeAspect[1];

  const onCropComplete = useCallback((_: unknown, areaPixels: CropArea) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  function handlePresetPick(preset: AspectPreset) {
    setActiveAspect(preset.aspect);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    const croppedUri = await getCroppedBlob(imageUri, croppedAreaPixels);
    onConfirm(croppedUri, activeAspect);
  }

  if (!Cropper) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {presets && presets.length > 0 ? (
            <View style={styles.presetRow}>
              {presets.map((p) => {
                const isActive = p.aspect[0] === activeAspect[0] && p.aspect[1] === activeAspect[1];
                return (
                  <Pressable
                    key={p.label}
                    onPress={() => handlePresetPick(p)}
                    style={[styles.presetBtn, isActive && styles.presetBtnActive]}
                  >
                    <Text style={[styles.presetLabel, isActive && styles.presetLabelActive]}>
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={[styles.cropArea, { aspectRatio }]}>
            <Cropper
              image={imageUri}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={5}
              zoomSpeed={0.05}
              aspect={aspectRatio}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </View>
          <View style={styles.zoomRow}>
            <Text style={styles.zoomLabel}>Zoom</Text>
            <input
              type="range"
              min={1}
              max={5}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text>
          </View>
          {usageHint ? (
            <Text style={styles.usageHint}>{usageHint}</Text>
          ) : null}
          <View style={styles.controls}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
              <Text style={styles.confirmText}>Crop & Upload</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 600,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.background + '88',
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetBtnActive: {
    backgroundColor: colors.brand + '33',
    borderColor: colors.brand,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  presetLabelActive: {
    color: colors.brand,
  },
  cropArea: {
    position: 'relative',
    width: '100%',
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  } as any,
  zoomLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
    minWidth: 42,
    textAlign: 'right' as const,
  },
  usageHint: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center' as const,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    padding: spacing.md,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
