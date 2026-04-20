import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCurrentWorldStore } from '@vaultstone/store';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

const DISMISS_AFTER_MS = 6_000;

// Transient banner that fires when `lensCampaignId` changes while a player
// is viewing the world — i.e., "DM switched lens to <Campaign>". For now
// the trigger is any change to the lens selection in the current-world
// store; Phase 5+ (session realtime) will narrow this to mid-session
// changes broadcast by the DM so players are the only ones who see the
// banner. Auto-dismisses after 6s, or on click.
//
// Reuses the `.takeover-banner` chrome with the amber lens accent.
export function LensSwitchBanner() {
  const lensCampaignId = useCurrentWorldStore((s) => s.lensCampaignId);
  const linkedCampaigns = useCurrentWorldStore((s) => s.linkedCampaigns);
  const [shownLens, setShownLens] = useState<string | null>(null);
  const prevLensRef = useRef<string | null>(lensCampaignId);

  useEffect(() => {
    if (prevLensRef.current !== lensCampaignId && lensCampaignId !== null) {
      setShownLens(lensCampaignId);
    }
    prevLensRef.current = lensCampaignId;
  }, [lensCampaignId]);

  useEffect(() => {
    if (!shownLens) return;
    const t = setTimeout(() => setShownLens(null), DISMISS_AFTER_MS);
    return () => clearTimeout(t);
  }, [shownLens]);

  if (!shownLens) return null;
  const campaign = linkedCampaigns.find((c) => c.id === shownLens);
  if (!campaign) return null;

  return (
    <View style={styles.root}>
      <Icon name="workspace-premium" size={14} color={colors.gm} />
      <Text variant="label-md" weight="semibold" style={{ color: colors.gm }}>
        Lens switched
      </Text>
      <Text variant="body-sm" tone="secondary" style={{ flex: 1 }}>
        Now viewing this world through "{campaign.name}". Visibility filters
        follow this campaign until the DM switches lens again.
      </Text>
      <Pressable onPress={() => setShownLens(null)} style={styles.dismissBtn}>
        <Icon name="close" size={16} color={colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.gmContainer + '66',
    borderLeftWidth: 3,
    borderLeftColor: colors.gm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  dismissBtn: {
    padding: spacing.xs,
  },
});
