// New campaign — minimal form. Just collects a name and creates the row;
// every other setup decision (game system, world, content packs,
// character creation rules) lives on the V2 campaign page's setup
// checklist so the DM walks through them in one consistent place.
//
// The campaign is created with a sensible default system (the most
// recent D&D 5e edition) which the DM can change from the checklist
// before any players join. The system gate locks once any character
// is linked to the campaign.

import { useState } from 'react';
import { Pressable, ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { createCampaign } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  Text,
  colors,
  spacing,
} from '@vaultstone/ui';
import { BUNDLED_SYSTEMS_BY_ID } from '@vaultstone/systems';

// Default system applied at create time. The setup checklist surfaces
// a "Choose game system" step where the DM can confirm or swap before
// inviting players.
const DEFAULT_SYSTEM_ID = 'dnd5e_2024';

export default function NewCampaignScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const addCampaign = useCampaignStore((s) => s.addCampaign);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) {
      setError('Campaign name is required.');
      return;
    }
    if (!user) return;

    setLoading(true);
    setError('');

    const defaultSystem = BUNDLED_SYSTEMS_BY_ID[DEFAULT_SYSTEM_ID];

    const { data, error: err } = await createCampaign(name.trim(), {
      system: DEFAULT_SYSTEM_ID,
      // Keep system_label populated with the default's display name so
      // legacy code paths still get a non-null label. The setup checklist
      // updates both fields together via the existing manage-content modal.
      systemLabel: defaultSystem?.displayName,
    });

    setLoading(false);

    if (err || !data) {
      setError(err?.message ?? 'Failed to create campaign. Please try again.');
      return;
    }

    addCampaign(data);
    router.push(`/campaign/${data.id}`);
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.push('/(drawer)/campaigns')} style={styles.back}>
        <Icon name="chevron-left" size={18} color={colors.onSurfaceVariant} />
        <Text variant="body-sm" weight="medium" style={{ color: colors.onSurfaceVariant }}>
          Campaigns
        </Text>
      </Pressable>

      <Card tier="container" padding="lg" style={styles.card}>
        <View style={styles.header}>
          <Icon name="map" size={24} color={colors.primary} />
          <Text variant="headline-sm" family="headline" weight="bold">
            New campaign
          </Text>
        </View>

        <Text variant="body-sm" tone="secondary" style={styles.intro}>
          Name your campaign. You'll pick the game system, world, content
          packs, and character creation rules in the setup checklist on the
          next screen.
        </Text>

        {error ? (
          <Text variant="body-sm" style={{ color: colors.hpDanger, marginBottom: spacing.sm }}>
            {error}
          </Text>
        ) : null}

        <View style={styles.field}>
          <Input
            label="Campaign name"
            placeholder="e.g. Curse of Strahd"
            value={name}
            onChangeText={setName}
            autoFocus
          />
        </View>

        <View style={styles.footer}>
          <GhostButton
            label="Cancel"
            onPress={() => router.push('/(drawer)/campaigns')}
          />
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <GradientButton label="Create campaign" onPress={handleCreate} />
          )}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surfaceCanvas },
  container: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 560,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  intro: {
    color: colors.onSurfaceVariant,
    marginBottom: spacing.lg,
  },
  field: {
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
});
