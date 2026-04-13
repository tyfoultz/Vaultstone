import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { signUp } from '@vaultstone/api';
import { colors, spacing, fonts } from '@vaultstone/ui';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSignUp() {
    if (!email || !password || !confirm) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: authError } = await signUp(email.trim(), password);
    setLoading(false);
    if (authError) {
      setError('Could not create account. Try a different email.');
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <MaterialCommunityIcons
            name="email-check-outline"
            size={48}
            color={colors.brand}
            style={{ alignSelf: 'center', marginBottom: spacing.md }}
          />
          <Text style={s.doneTitle}>Check your email</Text>
          <Text style={s.doneSubtitle}>
            We sent a verification link to{'\n'}{email}{'\n\n'}Click it to activate your account.
          </Text>
          <Link href="/(auth)/login" style={s.link}>
            Back to sign in
          </Link>
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.card}>
        <View style={s.logoRow}>
          <MaterialCommunityIcons name="shield-crown-outline" size={36} color={colors.brand} />
          <Text style={s.logoText}>Vaultstone</Text>
        </View>
        <Text style={s.subtitle}>Create your account</Text>

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
          autoComplete="new-password"
        />
        <TextInput
          style={s.input}
          placeholder="Confirm password"
          placeholderTextColor={colors.textSecondary}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
        />

        <TouchableOpacity style={s.button} onPress={handleSignUp} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.buttonText}>Create Account</Text>
          }
        </TouchableOpacity>

        <Link href="/(auth)/login" style={s.link}>
          Already have an account? Sign in
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
  doneTitle: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  doneSubtitle: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
});
