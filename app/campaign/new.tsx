import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { createCampaign, generateJoinCode } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';

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
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.push('/(tabs)/campaigns')} style={styles.back}>
        <Text style={styles.backText}>← Campaigns</Text>
      </TouchableOpacity>

      <Text style={styles.title}>New Campaign</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Campaign name *"
        placeholderTextColor={colors.textSecondary}
        value={name}
        onChangeText={setName}
        autoFocus
        returnKeyType="next"
      />

      <TextInput
        style={styles.input}
        placeholder="System (optional — e.g. D&D 5e, PF2e)"
        placeholderTextColor={colors.textSecondary}
        value={systemLabel}
        onChangeText={setSystemLabel}
        returnKeyType="next"
      />

      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Description (optional)"
        placeholderTextColor={colors.textSecondary}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        returnKeyType="done"
        onSubmitEditing={handleCreate}
      />

      <TouchableOpacity style={styles.button} onPress={handleCreate} disabled={loading}>
        {loading
          ? <ActivityIndicator color={colors.textPrimary} />
          : <Text style={styles.buttonText}>Create Campaign</Text>
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
    marginBottom: 32,
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
    fontSize: 16,
    marginBottom: 12,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
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
