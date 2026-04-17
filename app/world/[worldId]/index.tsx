import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getCampaignsForWorld } from '@vaultstone/api';
import { useCurrentWorldStore } from '@vaultstone/store';
import {
  Card,
  Chip,
  Icon,
  MetaLabel,
  SectionHeader,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

export default function WorldLandingScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const world = useCurrentWorldStore((s) => s.world);
  const [linkedCampaigns, setLinkedCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    if (!worldId) return;
    getCampaignsForWorld(worldId).then(({ data }) => {
      const rows = (data ?? []) as unknown as Array<{ campaigns: Campaign | null }>;
      setLinkedCampaigns(rows.map((r) => r.campaigns).filter((c): c is Campaign => !!c));
    });
  }, [worldId]);

  if (!world) return null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <LinearGradient
        colors={[colors.primaryContainer, colors.secondaryContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCover}
      >
        <Icon name="public" size={72} color={colors.onPrimary} />
      </LinearGradient>

      <View style={styles.headerBlock}>
        <MetaLabel tone="accent">Chronicle</MetaLabel>
        <Text
          variant="display-sm"
          family="headline"
          weight="bold"
          style={{ marginTop: 4, letterSpacing: -1 }}
        >
          {world.name}
        </Text>
        {world.description ? (
          <Text
            variant="body-lg"
            tone="secondary"
            style={{
              marginTop: spacing.md,
              color: colors.onSurfaceVariant,
              maxWidth: 720,
            }}
          >
            {world.description}
          </Text>
        ) : null}
      </View>

      {linkedCampaigns.length > 0 ? (
        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Linked campaigns" />
          <View style={styles.chipRow}>
            {linkedCampaigns.map((c) => (
              <Chip key={c.id} label={c.name} variant="category" />
            ))}
          </View>
        </View>
      ) : null}

      <Card tier="container" padding="lg" style={styles.comingSoon}>
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Icon name="auto-stories" size={36} color={colors.primary} />
          <Text
            variant="title-md"
            family="headline"
            weight="bold"
            style={{ textAlign: 'center' }}
          >
            Your chronicle begins here.
          </Text>
          <Text
            variant="body-md"
            tone="secondary"
            style={{
              textAlign: 'center',
              maxWidth: 480,
              color: colors.onSurfaceVariant,
            }}
          >
            Sections, pages, maps, and timelines arrive in the next phase. For
            now, the world is claimed — the atlas and lore come next.
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  heroCover: {
    width: '100%',
    height: 180,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBlock: {
    marginTop: spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  comingSoon: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
});
