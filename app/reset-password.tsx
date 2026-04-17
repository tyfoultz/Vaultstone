import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { updatePassword } from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  spacing,
  Surface,
  Card,
  Input,
  Text,
  GradientButton,
} from '@vaultstone/ui';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const setSession = useAuthStore((state) => state.setSession);

  async function handleUpdate() {
    if (!password || !confirm) {
      setError('Please fill in both fields.');
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
    const { error: updateError } = await updatePassword(password);
    setLoading(false);
    if (updateError) {
      setError('Could not update password. The link may have expired.');
    } else {
      setSession(null);
      setDone(true);
    }
  }

  if (done) {
    return (
      <Surface tier="void" style={styles.container}>
        <Card tier="high" padding="lg" style={styles.card}>
          <Text
            variant="headline-sm"
            family="headline"
            weight="bold"
            style={{ textAlign: 'center', marginBottom: spacing.sm }}
          >
            Password updated
          </Text>
          <Text
            variant="body-md"
            tone="secondary"
            style={{ textAlign: 'center', marginBottom: spacing.lg }}
          >
            You can now sign in with your new password.
          </Text>
          <GradientButton
            label="Sign In"
            fullWidth
            size="lg"
            onPress={() => router.replace('/(auth)/login')}
          />
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
          New password
        </Text>
        <Text variant="body-sm" tone="secondary" style={{ marginBottom: spacing.lg }}>
          Choose a new password for your account.
        </Text>

        {error ? (
          <Text variant="body-sm" tone="danger" style={{ marginBottom: spacing.md }}>
            {error}
          </Text>
        ) : null}

        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Input
            label="New password"
            placeholder="at least 8 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />
          <Input
            label="Confirm new password"
            placeholder="••••••••"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoComplete="new-password"
          />
        </View>

        <GradientButton
          label="Update password"
          fullWidth
          size="lg"
          loading={loading}
          onPress={handleUpdate}
        />
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
});
