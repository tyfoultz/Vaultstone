import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { signOut, getProfile, upsertProfile } from '@vaultstone/api';
import { useAuthStore, useProfileStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';

export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);
  const { profile, setProfile } = useProfileStore();
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getProfile(user.id).then(({ data }) => {
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name ?? '');
      }
      setLoading(false);
    });
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { data } = await upsertProfile(user.id, {
      display_name: displayName.trim() || null,
    });
    setSaving(false);
    if (data) {
      setProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handleSignOut() {
    await signOut();
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      {/* Profile card */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons name="account-circle-outline" size={24} color={colors.brand} />
          <Text style={s.cardTitle}>Profile</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.lg }} />
        ) : (
          <>
            <View style={s.field}>
              <Text style={s.fieldLabel}>Display Name</Text>
              <TextInput
                style={s.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="How others see you"
                placeholderTextColor={colors.textSecondary}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>

            <View style={s.field}>
              <Text style={s.fieldLabel}>Email</Text>
              <Text style={s.fieldValue}>{user?.email}</Text>
            </View>

            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.saveBtnText}>{saved ? 'Saved!' : 'Save Profile'}</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Account card */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons name="cog-outline" size={24} color={colors.brand} />
          <Text style={s.cardTitle}>Account</Text>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <MaterialCommunityIcons name="logout" size={18} color={colors.hpDanger} />
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  field: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  fieldValue: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  input: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    justifyContent: 'center',
  },
  signOutText: {
    color: colors.hpDanger,
    fontSize: 15,
    fontWeight: '600',
  },
});
