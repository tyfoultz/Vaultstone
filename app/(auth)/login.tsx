import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { signIn } from '@vaultstone/api';
import { colors, spacing, fonts } from '@vaultstone/ui';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSignIn() {
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: authError } = await signIn(email.trim(), password);
    setLoading(false);
    if (authError) {
      setError('Invalid email or password.');
    }
  }

  return (
    <View style={s.container}>
      <View style={s.card}>
        <View style={s.logoRow}>
          <MaterialCommunityIcons name="shield-crown-outline" size={36} color={colors.brand} />
          <Text style={s.logoText}>Vaultstone</Text>
        </View>
        <Text style={s.subtitle}>Sign in to continue</Text>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <TextInput
          style={s.input}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextInput
          style={s.input}
          placeholder="Password"
          placeholderTextColor={colors.textSecondary}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />

        <TouchableOpacity style={s.button} onPress={handleSignIn} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.buttonText}>Sign In</Text>
          }
        </TouchableOpacity>

        <Link href="/(auth)/signup" style={s.link}>
          Don't have an account? Sign up
        </Link>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  logoText: {
    fontSize: 28,
    fontFamily: fonts.display,
    color: colors.textPrimary,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  error: {
    color: colors.hpDanger,
    textAlign: 'center',
    marginBottom: spacing.md,
    fontSize: 14,
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
    marginBottom: spacing.sm,
  },
  button: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  link: {
    color: colors.brand,
    textAlign: 'center',
    fontSize: 14,
  },
});
