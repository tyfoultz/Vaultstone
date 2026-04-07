import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { signOut } from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';

export default function SettingsScreen() {
  const user = useAuthStore((state) => state.user);

  async function handleSignOut() {
    await signOut();
    // onAuthStateChange fires, clears the store, tabs layout redirects to login
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Signed in as</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <TouchableOpacity style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  email: {
    color: colors.textPrimary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 48,
  },
  button: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: colors.hpDanger,
    fontSize: 16,
    fontWeight: '600',
  },
});
