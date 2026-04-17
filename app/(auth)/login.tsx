import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { signIn } from '@vaultstone/api';
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
            Sign in
          </Text>
          <Text variant="body-sm" tone="secondary" style={{ marginBottom: spacing.lg }}>
            Cross the threshold into your campaigns.
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
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
            />
          </View>

          <GradientButton
            label="Sign In"
            fullWidth
            size="lg"
            loading={loading}
            onPress={handleSignIn}
          />

          <View style={{ marginTop: spacing.lg, gap: spacing.sm, alignItems: 'center' }}>
            <Link href="/(auth)/forgot-password" style={styles.linkText as any}>
              Forgot password?
            </Link>
            <Link href="/(auth)/signup" style={styles.linkText as any}>
              Don't have an account? Sign up
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
