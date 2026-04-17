import { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Link } from 'expo-router';
import { resetPasswordForEmail } from '@vaultstone/api';
import {
  colors,
  spacing,
  Surface,
  Card,
  Input,
  Text,
  GradientButton,
} from '@vaultstone/ui';

function getResetRedirect() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/reset-password`;
  }
  return 'vaultstone://reset-password';
}

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleReset() {
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: resetError } = await resetPasswordForEmail(email.trim(), getResetRedirect());
    setLoading(false);
    if (resetError) {
      setError('Could not send reset email. Check the address and try again.');
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <Surface tier="void" style={styles.container}>
        <Card tier="high" padding="lg" style={styles.card}>
          <Text
            variant="headline-sm"
            family="headline"
            weight="bold"
            style={{ textAlign: 'center', marginBottom: spacing.sm }}
          >
            Check your email
          </Text>
          <Text variant="body-md" tone="secondary" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
            A reset link was sent to{'\n'}{email}
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
      <Card tier="high" padding="lg" style={styles.card}>
        <Text
          variant="headline-sm"
          family="headline"
          weight="bold"
          style={{ marginBottom: spacing.xs }}
        >
          Reset password
        </Text>
        <Text variant="body-sm" tone="secondary" style={{ marginBottom: spacing.lg }}>
          Enter your email and we'll send a reset link.
        </Text>

        {error ? (
          <Text variant="body-sm" tone="danger" style={{ marginBottom: spacing.md }}>
            {error}
          </Text>
        ) : null}

        <View style={{ marginBottom: spacing.md }}>
          <Input
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
        </View>

        <GradientButton
          label="Send reset link"
          fullWidth
          size="lg"
          loading={loading}
          onPress={handleReset}
        />

        <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
          <Link href="/(auth)/login" style={styles.linkText as any}>
            Back to sign in
          </Link>
        </View>
      </Card>
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
  card: {
    width: '100%',
    maxWidth: 420,
  },
  linkText: {
    color: colors.primary,
    fontFamily: 'Manrope',
    fontSize: 14,
    textAlign: 'center' as const,
  },
});
