import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { getProfile } from '@vaultstone/api';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

type Props = {
  ownerUserId: string;
  lockedSinceIso: string;
  onRetry?: () => void;
};

const LOCK_TTL_SECONDS = 90;

// Matches handoff `.takeover-banner`: amber gradient background with a 3px
// left accent border, pencil icon, inline message ("<Kira> is editing this
// page — you're viewing read-only"), and a right-aligned "Request Takeover"
// pill button. Re-renders every second so the countdown stays live.
export function EditLockBanner({ ownerUserId, lockedSinceIso, onRetry }: Props) {
  const [name, setName] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await getProfile(ownerUserId);
      if (!cancelled) setName(data?.display_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerUserId]);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.max(0, Math.floor((nowTick - Date.parse(lockedSinceIso)) / 1000));
  const remaining = Math.max(0, LOCK_TTL_SECONDS - elapsed);
  const ownerLabel = name ?? 'Another editor';

  return (
    <View style={[styles.root, webGradient]}>
      <Icon name="edit" size={14} color={colors.gm} />
      <View style={styles.messageWrap}>
        <Text variant="body-sm" style={styles.message}>
          <Text variant="body-sm" weight="semibold" style={styles.messageStrong}>
            {ownerLabel}
          </Text>{' '}
          is editing this page
          {remaining > 0 ? ` — lock expires in ${remaining}s.` : ' — lock expired.'}
        </Text>
      </View>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.takeover}>
          <Text
            variant="label-sm"
            weight="semibold"
            uppercase
            style={styles.takeoverLabel}
          >
            Request Takeover
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Web-only gradient — RN's StyleSheet can't express linear-gradient, but the
// handoff .takeover-banner uses a subtle amber fade. On native we fall back
// to a flat gmContainer background.
const webGradient =
  Platform.OS === 'web'
    ? ({
        background:
          'linear-gradient(90deg, rgba(230, 162, 85, 0.15), rgba(230, 162, 85, 0.05))',
      } as object)
    : { backgroundColor: colors.gmContainer };

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.gm,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  messageWrap: {
    flex: 1,
  },
  message: {
    color: colors.onSurface,
    fontSize: 12.5,
    lineHeight: 18,
  },
  messageStrong: {
    color: colors.onSurface,
    fontSize: 12.5,
  },
  takeover: {
    borderWidth: 1,
    borderColor: colors.gm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: 4,
  },
  takeoverLabel: {
    color: colors.gm,
    fontSize: 10,
    letterSpacing: 1,
  },
});
