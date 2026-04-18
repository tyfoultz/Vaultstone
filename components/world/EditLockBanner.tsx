import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { getProfile } from '@vaultstone/api';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  ownerUserId: string;
  lockedSinceIso: string;
  onRetry?: () => void;
};

const LOCK_TTL_SECONDS = 90;

// Shows who currently holds the edit lock and how long until it expires (the
// server-side TTL is 90s; after that anyone can claim). Re-renders every
// second so the "Nn s left" countdown stays live.
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
  const label = name ?? 'Another editor';

  return (
    <View style={styles.root}>
      <View style={styles.iconTile}>
        <Icon name="lock" size={16} color={colors.gm} />
      </View>
      <View style={styles.text}>
        <Text variant="label-md" weight="semibold">
          {label} is editing this page
        </Text>
        <MetaLabel tone="muted" size="sm">
          {remaining > 0
            ? `Lock expires in ${remaining}s — your edits are disabled until then.`
            : 'Lock expired. Tap "Try again" to take over.'}
        </MetaLabel>
      </View>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Text variant="label-md" tone="accent">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.gmContainer,
    borderWidth: 1,
    borderColor: colors.gm,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
  retry: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
