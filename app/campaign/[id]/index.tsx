import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Clipboard, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { campaigns, setActiveCampaign } = useCampaignStore();
  const [campaign, setCampaign] = useState<Campaign | null>(
    campaigns.find((c) => c.id === id) ?? null
  );
  const [copied, setCopied] = useState(false);

  const isDM = campaign?.dm_user_id === user?.id;

  useEffect(() => {
    if (campaign) {
      setActiveCampaign(campaign);
      return;
    }
    supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) {
          setCampaign(data);
          setActiveCampaign(data);
        }
      });
  }, [id]);

  function copyJoinCode() {
    if (!campaign) return;
    Clipboard.setString(campaign.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!campaign) {
    return (
      <View style={styles.container}>
        <Text style={styles.textSecondary}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Campaigns</Text>
      </TouchableOpacity>

      <View style={styles.titleRow}>
        <Text style={styles.title}>{campaign.name}</Text>
        <Text style={styles.role}>{isDM ? 'DM' : 'Player'}</Text>
      </View>

      {isDM && (
        <View style={styles.section}>
          <Text style={styles.label}>Join Code</Text>
          <View style={styles.codeRow}>
            <Text style={styles.code}>{campaign.join_code}</Text>
            <TouchableOpacity onPress={copyJoinCode} style={styles.copyButton}>
              <Text style={styles.copyText}>{copied ? 'Copied!' : 'Copy'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Share this code with players so they can join.</Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.placeholder}>
          {isDM ? 'Party view coming next.' : 'Character creation coming next.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  back: {
    marginBottom: 32,
  },
  backText: {
    color: colors.brand,
    fontSize: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  role: {
    fontSize: 12,
    color: colors.textSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  section: {
    marginBottom: 32,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  code: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 4,
  },
  copyButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  copyText: {
    color: colors.brand,
    fontSize: 14,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 8,
  },
  placeholder: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  textSecondary: {
    color: colors.textSecondary,
  },
});
