import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { signIn } from '@vaultstone/api';
import { colors } from '@vaultstone/ui';

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
    // On success onAuthStateChange fires, updates the store, and (auth) layout redirects.
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vaultstone</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
      />

      <TouchableOpacity style={styles.button} onPress={handleSignIn} disabled={loading}>
        {loading
          ? <ActivityIndicator color={colors.textPrimary} />
          : <Text style={styles.buttonText}>Sign In</Text>
        }
      </TouchableOpacity>

      <Link href="/(auth)/signup" style={styles.link}>
        Don't have an account? Sign up
      </Link>
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
  title: {
    fontSize: 36,
    color: colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  error: {
    color: colors.hpDanger,
    textAlign: 'center',
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
  button: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    color: colors.brand,
    textAlign: 'center',
    fontSize: 14,
  },
});
