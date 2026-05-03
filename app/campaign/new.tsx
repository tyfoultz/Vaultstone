import { useState } from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { createCampaign } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';
import { BUNDLED_SYSTEMS_ORDER } from '@vaultstone/systems';

// Bundled systems offered as choices in the picker. Order comes from the
// registry; the per-system blurb is local to this screen since it's only
// shown here.
const BLURBS: Record<string, string> = {
  dnd5e_2024: 'Modern 5e ruleset (2024 SRD 5.2).',
  dnd5e_2014: 'Classic 5e ruleset (2014 SRD 5.1).',
  custom:     'Bring-your-own — no bundled content.',
};
const SYSTEM_OPTIONS = BUNDLED_SYSTEMS_ORDER.map((def) => ({
  def,
  blurb: BLURBS[def.id] ?? '',
}));

export default function NewCampaignScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const addCampaign = useCampaignStore((s) => s.addCampaign);
  const [name, setName] = useState('');
  const [systemId, setSystemId] = useState<string>(SYSTEM_OPTIONS[0].def.id);
  const [description, setDescription] = useState('');
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

    const selected = SYSTEM_OPTIONS.find((o) => o.def.id === systemId)?.def;

    const { data, error: err } = await createCampaign(name.trim(), {
      system: systemId,
      // Keep system_label populated with the chosen system's display name —
      // legacy code paths still read it, and it's a useful breadcrumb in the
      // campaign list cover header.
      systemLabel: selected?.displayName,
      description,
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

        <View style={styles.field}>
          <MetaLabel size="sm">Game system</MetaLabel>
          <Text variant="body-sm" tone="secondary" style={styles.helpText}>
            Sets the rulebook and content available for character creation.
            Players who join this campaign create characters under this
            system.
          </Text>
          <View style={styles.systemList}>
            {SYSTEM_OPTIONS.map(({ def, blurb }) => {
              const selected = systemId === def.id;
              // Custom system authoring isn't built yet; render the row
              // disabled with a Coming Soon hint instead of letting users
              // pick a path that has no UX behind it.
              const comingSoon = def.id === 'custom';
              return (
                <Pressable
                  key={def.id}
                  onPress={comingSoon ? undefined : () => setSystemId(def.id)}
                  disabled={comingSoon}
                  style={({ pressed }) => [
                    styles.systemRow,
                    selected && styles.systemRowSelected,
                    comingSoon && styles.systemRowDisabled,
                    pressed && !comingSoon && { opacity: 0.85 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: comingSoon }}
                >
                  <View style={styles.systemRadio}>
                    {selected ? <View style={styles.systemRadioFill} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text
                        variant="body-md"
                        weight="bold"
                        style={{ color: selected ? colors.primary : colors.onSurface }}
                      >
                        {def.displayName}
                      </Text>
                      {comingSoon ? (
                        <Text variant="label-sm" weight="semibold" uppercase style={styles.comingSoonTag}>
                          Coming Soon
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="body-sm" tone="secondary">
                      v{def.version} · {blurb}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Input
            label="Description"
            placeholder="What's the campaign about?"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
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
    marginBottom: spacing.lg,
  },
  field: {
    marginBottom: spacing.md,
  },
  helpText: {
    color: colors.onSurfaceVariant,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  systemList: {
    gap: spacing.xs + 2,
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  systemRowSelected: {
    borderColor: colors.primary + '88',
    backgroundColor: colors.primaryContainer + '22',
  },
  systemRowDisabled: {
    opacity: 0.5,
  },
  comingSoonTag: {
    color: colors.onSurfaceVariant,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    fontSize: 9,
    letterSpacing: 0.6,
  },
  systemRadio: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.outlineVariant + '99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemRadioFill: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
  },
});
