import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Modal, Pressable, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { Cinzel_700Bold } from '@expo-google-fonts/cinzel';
import { CrimsonPro_400Regular, CrimsonPro_600SemiBold, CrimsonPro_700Bold } from '@expo-google-fonts/crimson-pro';
import { supabase, getProfile, upsertProfile } from '@vaultstone/api';
import { useAuthStore, useProfileStore } from '@vaultstone/store';
import { colors, spacing, fonts } from '@vaultstone/ui';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Cinzel: Cinzel_700Bold,
    CrimsonPro: CrimsonPro_400Regular,
    'CrimsonPro-SemiBold': CrimsonPro_600SemiBold,
    'CrimsonPro-Bold': CrimsonPro_700Bold,
  });
  const { setSession, setInitialized, initialized, user } = useAuthStore();
  const { profile, setProfile } = useProfileStore();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');
  const [welcomeSaving, setWelcomeSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load profile when user is available
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    getProfile(user.id).then(({ data }) => {
      if (data) {
        setProfile(data);
        if (!data.display_name) setShowWelcome(true);
      } else {
        // No profile row yet — show welcome
        setShowWelcome(true);
      }
    });
  }, [user?.id]);

  async function handleWelcomeSave() {
    if (!user) return;
    const name = welcomeName.trim();
    if (!name) return;
    setWelcomeSaving(true);
    const { data } = await upsertProfile(user.id, { display_name: name });
    setWelcomeSaving(false);
    if (data) {
      setProfile(data);
      setShowWelcome(false);
    }
  }

  if (!initialized || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(drawer)" />
        <Stack.Screen name="campaign/new" />
        <Stack.Screen name="campaign/join" />
        <Stack.Screen name="campaign/[id]/index" />
        <Stack.Screen name="campaign/[id]/session" />
        <Stack.Screen name="campaign/[id]/pick-character" />
        <Stack.Screen name="character/[id]" />
        <Stack.Screen name="character/new" />
      </Stack>

      {/* Welcome modal for first-time profile setup */}
      <Modal visible={showWelcome && !!user} transparent animationType="fade">
        <Pressable style={ws.backdrop}>
          <View style={ws.card}>
            <Text style={ws.title}>Welcome to Vaultstone</Text>
            <Text style={ws.subtitle}>
              What should other players call you?
            </Text>
            <TextInput
              style={ws.input}
              value={welcomeName}
              onChangeText={setWelcomeName}
              placeholder="Your display name"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleWelcomeSave}
            />
            <TouchableOpacity
              style={[ws.btn, (!welcomeName.trim() || welcomeSaving) && { opacity: 0.5 }]}
              onPress={handleWelcomeSave}
              disabled={!welcomeName.trim() || welcomeSaving}
            >
              {welcomeSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={ws.btnText}>Get Started</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const ws = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    width: '90%',
    maxWidth: 400,
    padding: spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  input: {
    width: '100%',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  btn: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
