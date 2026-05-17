// Campaign window pane — DM-pinned imagery shared with the table.
//
// Rendered above the rest of the campaign page. Two slots:
//   • Scene (background — adapts to pinned image aspect, capped at 3:4)
//   • Subject (portrait overlay, top-right on scene — adapts to aspect)
//
// Pulls state from `getCampaignWindowPane`. When no scene is pinned
// the renderer falls back to the campaign's linked-world banner;
// when nothing is available at all (no pin, no banner) it shows a
// neutral placeholder so the layout doesn't collapse.
//
// DM-only controls (clear scene / clear subject) appear inline when
// the viewer is the DM. Pinning happens elsewhere — on world canvas
// images via the right-click → Pin to Scene / Pin as Subject flow.
//
// A pop-out button (web only) opens a fullscreen in-app modal
// showing the image at its native size.

import { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  getCampaignWindowPane,
  setCampaignSceneImage,
  setCampaignSubjectImage,
  type CampaignWindowPaneState,
  type WindowPaneSlot,
} from '@vaultstone/api';
import { colors, Icon, MetaLabel, radius, spacing, Text } from '@vaultstone/ui';

const MIN_ASPECT = 3 / 4; // portrait cap
const FALLBACK_ASPECT = 16 / 9;

function clampedAspect(slot: WindowPaneSlot | null, fallback: number): number {
  if (!slot || !slot.width || !slot.height) return fallback;
  const native = slot.width / slot.height;
  return Math.max(native, MIN_ASPECT);
}

type Props = {
  campaignId: string;
  isDM: boolean;
  refreshTick?: number;
};

export function CampaignWindowPane({ campaignId, isDM, refreshTick }: Props) {
  const [state, setState] = useState<CampaignWindowPaneState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'scene' | 'subject' | null>(null);
  const [popoutSlot, setPopoutSlot] = useState<WindowPaneSlot | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCampaignWindowPane(campaignId).then(({ data }) => {
      if (cancelled) return;
      setState(data ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaignId, refreshTick]);

  async function clearScene() {
    if (busy) return;
    setBusy('scene');
    await setCampaignSceneImage(campaignId, null);
    const { data } = await getCampaignWindowPane(campaignId);
    setState(data ?? null);
    setBusy(null);
  }

  async function clearSubject() {
    if (busy) return;
    setBusy('subject');
    await setCampaignSubjectImage(campaignId, null);
    const { data } = await getCampaignWindowPane(campaignId);
    setState(data ?? null);
    setBusy(null);
  }

  const sceneSrc = state?.scene?.signedUrl ?? state?.fallback?.signedUrl ?? null;
  const sceneCaption = state?.scene?.caption ?? '';
  const sceneIsFallback = !state?.scene && !!state?.fallback;
  const subject = state?.subject ?? null;

  const sceneAspect = clampedAspect(state?.scene ?? null, FALLBACK_ASPECT);
  const subjectNative = subject && subject.width && subject.height
    ? subject.width / subject.height
    : 9 / 16;
  const subjectAspect = Math.max(subjectNative, MIN_ASPECT);

  const isWeb = Platform.OS === 'web';
  const sceneNeedsPopout = state?.scene && state.scene.width && state.scene.height
    && (state.scene.width / state.scene.height) < MIN_ASPECT;

  return (
    <View style={styles.container}>
      <View style={[styles.frame, { aspectRatio: sceneAspect }]}>
        {loading ? (
          <View style={styles.placeholder}>
            <Text variant="body-sm" family="body" style={{ color: colors.outline }}>
              Loading…
            </Text>
          </View>
        ) : sceneSrc ? (
          <Image
            source={{ uri: sceneSrc }}
            style={styles.scene}
            resizeMode="cover"
            accessibilityLabel={
              state?.scene?.alt
                || state?.fallback?.campaignName
                || state?.fallback?.worldName
                || ''
            }
          />
        ) : (
          <View style={styles.placeholder}>
            <Icon name="image" size={32} color={colors.outline} />
            <Text variant="body-sm" family="body" style={{ color: colors.outline, marginTop: 6 }}>
              No scene pinned yet.
            </Text>
            {isDM ? (
              <Text variant="label-sm" family="body" style={{ color: colors.outline, marginTop: 2 }}>
                Right-click an image in your world to pin it here.
              </Text>
            ) : null}
          </View>
        )}

        {sceneIsFallback && isDM ? (
          <View style={styles.fallbackChip}>
            <MetaLabel size="sm">
              {state?.fallback?.campaignName ? 'Campaign cover' : 'World banner'}
            </MetaLabel>
          </View>
        ) : null}

        {/* Pop-out button — web only, shown when a scene is pinned */}
        {isWeb && state?.scene ? (
          <Pressable
            onPress={() => setPopoutSlot(state.scene)}
            style={({ pressed }) => [styles.popoutBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel="View full size"
          >
            <Icon name="open-in-full" size={16} color={colors.onSurface} />
          </Pressable>
        ) : null}

        {subject ? (
          <View style={[styles.subjectFrame, { aspectRatio: subjectAspect }]}>
            <Image
              source={{ uri: subject.signedUrl }}
              style={styles.subject}
              resizeMode="cover"
              accessibilityLabel={subject.alt}
            />
            {subject.caption ? (
              <View style={styles.subjectCaption}>
                <Text variant="label-sm" family="body" style={styles.subjectCaptionText} numberOfLines={3}>
                  {subject.caption}
                </Text>
              </View>
            ) : null}
            {/* Subject pop-out — web only */}
            {isWeb ? (
              <Pressable
                onPress={() => setPopoutSlot(subject)}
                style={({ pressed }) => [styles.subjectPopout, pressed && { opacity: 0.85 }]}
                accessibilityLabel="View subject full size"
              >
                <Icon name="open-in-full" size={12} color={colors.onSurface} />
              </Pressable>
            ) : null}
            {isDM ? (
              <Pressable
                onPress={clearSubject}
                disabled={busy === 'subject'}
                style={({ pressed }) => [styles.subjectClear, pressed && { opacity: 0.85 }]}
                accessibilityLabel="Clear subject"
              >
                <Icon name="close" size={16} color={colors.onSurface} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {sceneCaption ? (
        <View style={styles.sceneCaptionStrip}>
          <Text variant="body-sm" family="body" style={styles.sceneCaptionText}>
            {sceneCaption}
          </Text>
        </View>
      ) : null}

      {isDM && state?.scene ? (
        <View style={styles.controls}>
          <Pressable
            onPress={clearScene}
            disabled={busy === 'scene'}
            style={({ pressed }) => [styles.clearBtn, pressed && { opacity: 0.85 }]}
          >
            <Icon name="close" size={14} color={colors.onSurfaceVariant} />
            <Text variant="label-sm" family="body" weight="semibold" style={styles.clearBtnText}>
              Clear scene
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Fullscreen pop-out modal — web only */}
      {popoutSlot ? (
        <Modal visible transparent animationType="fade">
          <Pressable style={styles.popoutBackdrop} onPress={() => setPopoutSlot(null)}>
            <Pressable style={styles.popoutContainer} onPress={() => {}}>
              {/* Use native <img> on web for proper contain-within-viewport behavior */}
              {isWeb ? (
                <img
                  src={popoutSlot.signedUrl}
                  alt={popoutSlot.alt}
                  style={{
                    maxWidth: '90vw',
                    maxHeight: '85vh',
                    objectFit: 'contain',
                    borderRadius: 8,
                  }}
                  draggable={false}
                />
              ) : (
                <Image
                  source={{ uri: popoutSlot.signedUrl }}
                  style={styles.popoutImage}
                  resizeMode="contain"
                  accessibilityLabel={popoutSlot.alt}
                />
              )}
              {popoutSlot.caption ? (
                <Text variant="body-md" family="body" style={styles.popoutCaption}>
                  {popoutSlot.caption}
                </Text>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => setPopoutSlot(null)}
              style={({ pressed }) => [styles.popoutClose, pressed && { opacity: 0.85 }]}
            >
              <Icon name="close" size={24} color={colors.onSurface} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  frame: {
    position: 'relative',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  scene: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  fallbackChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.surfaceContainerHigh + 'CC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  popoutBtn: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh + 'CC',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '88',
  },
  subjectFrame: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '88',
    backgroundColor: colors.surfaceContainerHigh,
  },
  subject: {
    width: '100%',
    height: '100%',
  },
  subjectCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: 'rgba(12, 14, 16, 0.78)',
  },
  subjectCaptionText: {
    color: colors.onSurface,
    fontStyle: 'italic',
  },
  subjectPopout: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh + 'CC',
  },
  subjectClear: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh + 'CC',
  },
  sceneCaptionStrip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  sceneCaptionText: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  clearBtnText: {
    color: colors.onSurfaceVariant,
    letterSpacing: 0.5,
  },

  // Pop-out modal
  popoutBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  popoutContainer: {
    alignItems: 'center',
  },
  popoutImage: {
    width: '100%',
    height: '100%',
  },
  popoutCaption: {
    color: colors.onSurface,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: spacing.sm,
    opacity: 0.8,
  },
  popoutClose: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh + 'AA',
  },
});
