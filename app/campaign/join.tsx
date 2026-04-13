import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCampaignByJoinCode, joinCampaign } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing, fonts } from '@vaultstone/ui';

export default function JoinCampaignScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { campaigns, setCampaigns } = useCampaignStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Join codes are 6 characters.');
      return;
    }
    if (!user) return;

    setLoading(true);
    setError('');

    const { data: campaign, error: lookupErr } = await getCampaignByJoinCode(trimmed);

    if (lookupErr || !campaign) {
      setLoading(false);
      setError('Campaign not found. Check the code and try again.');
      return;
    }

    const alreadyIn = campaign.dm_user_id === user.id ||
      campaigns.some((c) => c.id === campaign.id);

    if (alreadyIn) {
      setLoading(false);
      router.push(`/campaign/${campaign.id}`);
      return;
    }

    const { error: joinErr } = await joinCampaign(campaign.id, user.id);
    setLoading(false);

    if (joinErr) {
      setError('Failed to join campaign. Please try again.');
      return;
    }

    setCampaigns([campaign, ...campaigns]);
    router.push(`/campaign/${campaign.id}/pick-character`);
  }

  return (
    <View style={s.container}>
      <TouchableOpacity onPress={() => router.push('/(drawer)/campaigns')} style={s.back}>
        <Text style={s.backText}>← Campaigns</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <View style={s.headerRow}>
          <MaterialCommunityIcons name="account-plus-outline" size={28} color={colors.brand} />
          <Text style={s.title}>Join Campaign</Text>
        </View>
        <Text style={s.subtitle}>Enter the 6-character code your DM shared with you.</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TextInput
          style={s.codeInput}
          placeholder="XXXXXX"
          placeholderTextColor={colors.textSecondary}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleJoin}
        />

        <TouchableOpacity style={s.button} onPress={handleJoin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.buttonText}>Join</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
  },
  backText: { color: colors.brand, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  error: {
    color: colors.hpDanger,
    marginBottom: spacing.md,
    fontSize: 14,
  },
  codeInput: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
