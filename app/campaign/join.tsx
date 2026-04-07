import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { getCampaignByJoinCode, joinCampaign } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';

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

    // Already a member (DM or existing player)
    const alreadyIn = campaign.dm_user_id === user.id ||
      campaigns.some((c) => c.id === campaign.id);

    if (alreadyIn) {
      setLoading(false);
      router.replace(`/campaign/${campaign.id}`);
      return;
    }

    const { error: joinErr } = await joinCampaign(campaign.id, user.id);
    setLoading(false);

    if (joinErr) {
      setError('Failed to join campaign. Please try again.');
      return;
    }

    setCampaigns([campaign, ...campaigns]);
    router.replace(`/campaign/${campaign.id}`);
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Join Campaign</Text>
      <Text style={styles.subtitle}>Enter the 6-character code your DM shared with you.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
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

      <TouchableOpacity style={styles.button} onPress={handleJoin} disabled={loading}>
        {loading
          ? <ActivityIndicator color={colors.textPrimary} />
          : <Text style={styles.buttonText}>Join</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 32,
  },
  backText: {
    color: colors.brand,
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 32,
    lineHeight: 22,
  },
  error: {
    color: colors.hpDanger,
    marginBottom: 16,
    fontSize: 14,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
