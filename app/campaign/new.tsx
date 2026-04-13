import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createCampaign, generateJoinCode } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing, fonts } from '@vaultstone/ui';

export default function NewCampaignScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { campaigns, setCampaigns } = useCampaignStore();
  const [name, setName] = useState('');
  const [systemLabel, setSystemLabel] = useState('');
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

    const joinCode = generateJoinCode();
    const { data, error: err } = await createCampaign(
      name.trim(),
      user.id,
      joinCode,
      { systemLabel, description },
    );

    setLoading(false);

    if (err || !data) {
      setError('Failed to create campaign. Please try again.');
      return;
    }

    setCampaigns([data, ...campaigns]);
    router.push(`/campaign/${data.id}`);
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <TouchableOpacity onPress={() => router.push('/(drawer)/campaigns')} style={s.back}>
        <Text style={s.backText}>← Campaigns</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <View style={s.headerRow}>
          <MaterialCommunityIcons name="map-plus" size={28} color={colors.brand} />
          <Text style={s.title}>New Campaign</Text>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <View style={s.field}>
          <Text style={s.fieldLabel}>Campaign Name *</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Curse of Strahd"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="next"
          />
        </View>

        <View style={s.field}>
          <Text style={s.fieldLabel}>Game System</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. D&D 5e, Pathfinder 2e"
            placeholderTextColor={colors.textSecondary}
            value={systemLabel}
            onChangeText={setSystemLabel}
            returnKeyType="next"
          />
        </View>

        <View style={s.field}>
          <Text style={s.fieldLabel}>Description</Text>
          <TextInput
            style={[s.input, s.multiline]}
            placeholder="What's the campaign about?"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity style={s.button} onPress={handleCreate} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.buttonText}>Create Campaign</Text>
          }
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  backText: { color: colors.brand, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 480,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.textPrimary,
  },
  error: {
    color: colors.hpDanger,
    marginBottom: spacing.md,
    fontSize: 14,
  },
  field: { marginBottom: spacing.md },
  fieldLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.textPrimary,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
