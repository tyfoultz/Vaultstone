// Campaign window pane — DM-pinned imagery shared with the table.
//
// Rendered above the rest of the campaign page. Two slots:
//   • Scene (16:9 background)
//   • Subject (9:16 portrait, top-right overlay on scene)
//
// Pulls state from `getCampaignWindowPane`. When no scene is pinned
// the renderer falls back to the campaign's linked-world banner;
// when nothing is available at all (no pin, no banner) it shows a
// neutral placeholder so the layout doesn't collapse.
//
// DM-only controls (clear scene / clear subject) appear inline when
// the viewer is the DM. Pinning happens elsewhere — on world canvas
// images via the right-click → Pin to Scene / Pin as Subject flow.

import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import {
  getCampaignWindowPane,
  setCampaignSceneImage,
  setCampaignSubjectImage,
  type CampaignWindowPaneState,
} from '@vaultstone/api';
import { colors, Icon, MetaLabel, radius, spacing, Text } from '@vaultstone/ui';

type Props = {
  campaignId: string;
  /** When true, renders DM clear-pin controls. Should match
   *  `campaign.dm_user_id === user.id` from the caller. */
  isDM: boolean;
  /** Bumped by the parent when something pin-related changes
   *  (e.g. the DM just pinned a new image from the canvas). The
   *  pane refetches when this number ticks so the new pin shows
   *  without a remount. */
  refreshTick?: number;
};

export function CampaignWindowPane({ campaignId, isDM, refreshTick }: Props) {
  const [state, setState] = useState<CampaignWindowPaneState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'scene' | 'subject' | null>(null);

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

  // Choose what fills the scene slot. Order: pinned scene → world
  // banner → empty placeholder.
  const sceneSrc = state?.scene?.signedUrl ?? state?.fallback?.signedUrl ?? null;
  const sceneCaption = state?.scene?.caption ?? '';
  const sceneIsFallback = !state?.scene && !!state?.fallback;
  const subject = state?.subject ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        {/* Scene background */}
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
            accessibilityLabel={state?.scene?.alt || state?.fallback?.worldName || ''}
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

        {/* Fallback indicator chip — surfaces when the scene is
            using the world banner because no scene is pinned. Only
            shown to the DM so players don't see the "this is a
            fallback" plumbing. */}
        {sceneIsFallback && isDM ? (
          <View style={styles.fallbackChip}>
            <MetaLabel size="sm">World banner</MetaLabel>
          </View>
        ) : null}

        {/* Subject overlay — anchored top-right, 9:16. Drops out
            entirely when no subject is pinned. */}
        {subject ? (
          <View style={styles.subjectFrame}>
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

      {/* Scene caption strip below the pane. */}
      {sceneCaption ? (
        <View style={styles.sceneCaptionStrip}>
          <Text variant="body-sm" family="body" style={styles.sceneCaptionText}>
            {sceneCaption}
          </Text>
        </View>
      ) : null}

      {/* DM pin controls — only the clear-scene action lives here.
          Pinning new images happens on the world canvas (right-
          click). When nothing is pinned, the bar hides. */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  frame: {
    position: 'relative',
    aspectRatio: 16 / 9,
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
  subjectFrame: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    aspectRatio: 9 / 16,
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
});
