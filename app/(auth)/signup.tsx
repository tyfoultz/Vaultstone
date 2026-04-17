import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { signUp } from '@vaultstone/api';
import {
  colors,
  spacing,
  radius,
  Surface,
  Card,
  Icon,
  Input,
  Text,
  MetaLabel,
  GradientButton,
} from '@vaultstone/ui';

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
      <Surface tier="void" style={styles.container}>
        <Card tier="high" padding="lg" style={styles.card}>
          <View style={{ alignSelf: 'center', marginBottom: spacing.md }}>
            <Icon name="mark-email-read" size={48} color={colors.primary} />
          </View>
          <Text
            variant="headline-sm"
            family="headline"
            weight="bold"
            style={{ textAlign: 'center', marginBottom: spacing.sm }}
          >
            Check your email
          </Text>
          <Text
            variant="body-md"
            tone="secondary"
            style={{ textAlign: 'center', marginBottom: spacing.lg }}
          >
            We sent a verification link to{'\n'}{email}
          </Text>
          <Link href="/(auth)/login" style={styles.linkText as any}>
            Back to sign in
          </Link>
        </Card>
      </Surface>
    );
  }

  return (
    <Surface tier="void" style={styles.container}>
      <View style={styles.stack}>
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Icon name="auto-awesome" size={28} color={colors.primary} />
          </View>
          <View>
            <MetaLabel tone="muted">Celestial Record</MetaLabel>
            <Text
              variant="display-sm"
              family="headline"
              weight="bold"
              style={{ color: colors.primary, letterSpacing: -1 }}
            >
              Vaultstone
            </Text>
          </View>
        </View>

        <Card tier="high" padding="lg" style={styles.card}>
          <Text
            variant="title-lg"
            family="headline"
            weight="semibold"
            style={{ marginBottom: spacing.xs }}
          >
            Create your account
          </Text>
          <Text variant="body-sm" tone="secondary" style={{ marginBottom: spacing.lg }}>
            Begin your chronicle.
          </Text>

          {error ? (
            <Text variant="body-sm" tone="danger" style={{ marginBottom: spacing.md }}>
              {error}
            </Text>
          ) : null}

          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Input
              label="Password"
              placeholder="at least 8 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
            <Input
              label="Confirm password"
              placeholder="••••••••"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          <GradientButton
            label="Create Account"
            fullWidth
            size="lg"
            loading={loading}
            onPress={handleSignUp}
          />

          <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <Link href="/(auth)/login" style={styles.linkText as any}>
              Already have an account? Sign in
            </Link>
          </View>
        </Card>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stack: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.lg,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    alignSelf: 'center',
  },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
  },
  linkText: {
    color: colors.primary,
    fontFamily: 'Manrope',
    fontSize: 14,
    textAlign: 'center' as const,
  },
});
