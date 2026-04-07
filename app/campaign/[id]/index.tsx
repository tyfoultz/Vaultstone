import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Clipboard, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase, regenerateJoinCode, getCampaignMembers, removeCampaignMember } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

type Member = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  joined_at: string;
  profiles: { id: string; display_name: string | null } | null;
};

const ROLE_LABEL: Record<string, string> = {
  gm: 'DM',
  co_gm: 'Co-DM',
  player: 'Player',
};

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { campaigns, setCampaigns, setActiveCampaign } = useCampaignStore();
  const [campaign, setCampaign] = useState<Campaign | null>(
    campaigns.find((c) => c.id === id) ?? null
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const isDM = campaign?.dm_user_id === user?.id;

  useEffect(() => {
    if (!campaign) {
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
    } else {
      setActiveCampaign(campaign);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getCampaignMembers(id).then(({ data }) => {
      if (data) setMembers(data as Member[]);
    });
  }, [id]);

  function copyJoinCode() {
    if (!campaign) return;
    Clipboard.setString(campaign.join_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerateCode() {
    if (!campaign) return;
    setRegenerating(true);
    const { code } = await regenerateJoinCode(campaign.id);
    setRegenerating(false);
    if (code) {
      const updated = { ...campaign, join_code: code };
      setCampaign(updated);
      setActiveCampaign(updated);
    }
  }

  async function handleRemove(targetUserId: string) {
    if (!campaign) return;
    const { error } = await removeCampaignMember(campaign.id, targetUserId);
    if (!error) {
      setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
    }
  }

  async function handleLeave() {
    if (!campaign || !user) return;
    const { error } = await removeCampaignMember(campaign.id, user.id);
    if (!error) {
      setCampaigns(campaigns.filter((c) => c.id !== campaign.id));
      router.push('/(tabs)/campaigns');
    }
  }

  if (!campaign) {
    return (
      <View style={styles.container}>
        <Text style={styles.textSecondary}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <TouchableOpacity onPress={() => router.push('/(tabs)/campaigns')} style={styles.back}>
        <Text style={styles.backText}>← Campaigns</Text>
      </TouchableOpacity>

      <View style={styles.titleRow}>
        <Text style={styles.title}>{campaign.name}</Text>
        <Text style={styles.roleBadge}>{isDM ? 'DM' : 'Player'}</Text>
      </View>

      {(campaign.system_label || campaign.description) && (
        <View style={styles.section}>
          {campaign.system_label ? (
            <Text style={styles.meta}>{campaign.system_label}</Text>
          ) : null}
          {campaign.description ? (
            <Text style={styles.description}>{campaign.description}</Text>
          ) : null}
        </View>
      )}

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
          <TouchableOpacity onPress={handleRegenerateCode} disabled={regenerating} style={styles.regenerateButton}>
            <Text style={styles.regenerateText}>
              {regenerating ? 'Regenerating...' : 'Regenerate code'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Members</Text>
        {members.map((member) => {
          const isCurrentUser = member.user_id === user?.id;
          const displayName = member.profiles?.display_name ?? 'Anonymous';
          return (
            <View key={member.user_id} style={styles.memberRow}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{displayName}</Text>
                <Text style={styles.memberRole}>{ROLE_LABEL[member.role] ?? member.role}</Text>
              </View>
              {/* DM can remove anyone except themselves */}
              {isDM && !isCurrentUser && (
                <TouchableOpacity onPress={() => handleRemove(member.user_id)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
              {/* Players can leave */}
              {!isDM && isCurrentUser && (
                <TouchableOpacity onPress={handleLeave}>
                  <Text style={styles.removeText}>Leave</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.placeholder}>
          {isDM ? 'Party view coming next.' : 'Character creation coming next.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 48,
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
  roleBadge: {
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
    marginBottom: 12,
  },
  meta: {
    fontSize: 13,
    color: colors.brand,
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
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
  regenerateButton: {
    marginTop: 12,
  },
  regenerateText: {
    color: colors.textSecondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberName: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  memberRole: {
    fontSize: 11,
    color: colors.textSecondary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  removeText: {
    fontSize: 13,
    color: colors.hpDanger,
  },
  placeholder: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  textSecondary: {
    color: colors.textSecondary,
  },
});
