import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getWorldsForCampaign } from '@vaultstone/api';
import type { Database } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  Icon,
  MetaLabel,
  Text,
  colors,
  fonts,
  radius,
  spacing,
} from '@vaultstone/ui';

import { worldHref } from './worldHref';

type WorldCampaignRow = {
  world_id: string;
  campaign_id: string;
  created_at: string;
  worlds: Database['public']['Tables']['worlds']['Row'] | null;
};

type Props = {
  campaignId: string;
  onSearchOpen?: () => void;
};

export function CampaignWorldsCard({ campaignId, onSearchOpen }: Props) {
  const router = useRouter();
  const [worlds, setWorlds] = useState<WorldCampaignRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    getWorldsForCampaign(campaignId).then(({ data }) => {
      if (!cancelled && data) setWorlds(data as unknown as WorldCampaignRow[]);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  if (worlds.length === 0) return null;

  return (
    <Card tier="high" padding="lg" style={styles.card}>
      <View style={styles.header}>
        <Icon name="public" size={18} color={colors.primary} />
        <Text variant="title-sm" weight="semibold" style={{ flex: 1 }}>
          Linked Worlds
        </Text>
        {onSearchOpen ? (
          <GhostButton label="Search" onPress={onSearchOpen} />
        ) : null}
      </View>

      {worlds.map((wc) => {
        const w = wc.worlds;
        if (!w) return null;
        return (
          <Pressable
            key={w.id}
            onPress={() => router.push(worldHref(w.id))}
            style={styles.worldRow}
          >
            <Icon name="auto-stories" size={16} color={colors.onSurfaceVariant} />
            <View style={styles.worldBody}>
              <Text variant="body-sm" weight="semibold" numberOfLines={1}>
                {w.name}
              </Text>
              {w.description ? (
                <Text variant="label-sm" tone="secondary" numberOfLines={1}>
                  {w.description}
                </Text>
              ) : null}
            </View>
            <Icon name="chevron-right" size={16} color={colors.outlineVariant} />
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    borderRadius: radius.xl,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  worldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
  },
  worldBody: {
    flex: 1,
    gap: 1,
  },
});
