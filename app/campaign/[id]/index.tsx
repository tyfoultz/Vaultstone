import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Clipboard, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase, regenerateJoinCode, getCampaignMembers, removeCampaignMember } from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';
import type { Dnd5eStats } from '@vaultstone/types';
import CharacterPickerModal from '../../../components/campaign/CharacterPickerModal';

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type Character = Database['public']['Tables']['characters']['Row'];

type Member = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  joined_at: string;
  profiles: { id: string; display_name: string | null } | null;
  characters: { id: string; name: string; base_stats: unknown } | null;
};

const ROLE_LABEL: Record<string, string> = {
  gm: 'DM',
  co_gm: 'Co-DM',
  player: 'Player',
};

function characterSummary(member: Member): string | null {
  if (!member.characters) return null;
  const stats = member.characters.base_stats as Dnd5eStats | null;
  if (!stats?.classKey) return member.characters.name;
  const cls = stats.classKey.charAt(0).toUpperCase() + stats.classKey.slice(1);
  return `${member.characters.name}  ·  ${cls} ${stats.level ?? 1}`;
}

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
  const [pickerVisible, setPickerVisible] = useState(false);

  const isDM = campaign?.dm_user_id === user?.id;
  const myMember = members.find((m) => m.user_id === user?.id);

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
      if (data) setMembers(data as unknown as Member[]);
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

  function handleLinked(characterId: string | null, character: Character | null) {
    if (!user) return;
    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === user.id
          ? {
              ...m,
              character_id: characterId,
              characters: character
                ? { id: character.id, name: character.name, base_stats: character.base_stats }
                : null,
            }
          : m
      )
    );
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

      {/* Player character link prompt — shown when the current user is a player with no character linked */}
      {!isDM && myMember && !myMember.character_id && (
        <TouchableOpacity style={styles.linkPrompt} onPress={() => setPickerVisible(true)}>
          <Text style={styles.linkPromptTitle}>Link your character</Text>
          <Text style={styles.linkPromptSub}>
            Connect a character sheet so your party can see your state during sessions.
          </Text>
          <Text style={styles.linkPromptCta}>Choose character →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Members</Text>
        {members.map((member) => {
          const isCurrentUser = member.user_id === user?.id;
          const displayName = member.profiles?.display_name ?? 'Anonymous';
          const charSummary = characterSummary(member);
          const isPlayerRow = !isDM && isCurrentUser && member.role !== 'gm';

          return (
            <View key={member.user_id} style={styles.memberRow}>
              <View style={styles.memberLeft}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{displayName}</Text>
                  <Text style={styles.memberRole}>{ROLE_LABEL[member.role] ?? member.role}</Text>
                </View>
                {charSummary ? (
                  (() => {
                    const canView = isDM || isCurrentUser;
                    return canView ? (
                      <TouchableOpacity onPress={() => router.push(`/character/${member.character_id}`)}>
                        <Text style={[styles.characterLine, styles.characterLineLink]}>{charSummary} →</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.characterLine}>{charSummary}</Text>
                    );
                  })()
                ) : isPlayerRow ? (
                  <Text style={styles.characterLineMuted}>No character linked</Text>
                ) : null}
              </View>

              <View style={styles.memberActions}>
                {/* Player can tap to change their linked character */}
                {isPlayerRow && (
                  <TouchableOpacity onPress={() => setPickerVisible(true)} style={styles.linkButton}>
                    <Text style={styles.linkButtonText}>
                      {member.character_id ? 'Change' : 'Link'}
                    </Text>
                  </TouchableOpacity>
                )}
                {/* DM can remove anyone except themselves */}
                {isDM && !isCurrentUser && (
                  <TouchableOpacity onPress={() => handleRemove(member.user_id)}>
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
                {/* Players can leave */}
                {!isDM && isCurrentUser && (
                  <TouchableOpacity onPress={handleLeave} style={styles.leaveButton}>
                    <Text style={styles.removeText}>Leave</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {user && myMember && (
        <CharacterPickerModal
          visible={pickerVisible}
          campaignId={campaign.id}
          userId={user.id}
          currentCharacterId={myMember.character_id}
          onClose={() => setPickerVisible(false)}
          onLinked={handleLinked}
        />
      )}
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
  linkPrompt: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 32,
  },
  linkPromptTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  linkPromptSub: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  linkPromptCta: {
    fontSize: 14,
    color: colors.brand,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  memberLeft: {
    flex: 1,
    gap: 4,
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
  characterLine: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  characterLineLink: {
    color: colors.brand,
  },
  characterLineMuted: {
    fontSize: 12,
    color: colors.border,
    fontStyle: 'italic',
  },
  memberActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginLeft: 8,
  },
  linkButton: {
    borderColor: colors.brand,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  linkButtonText: {
    fontSize: 12,
    color: colors.brand,
  },
  leaveButton: {},
  removeText: {
    fontSize: 13,
    color: colors.hpDanger,
  },
  textSecondary: {
    color: colors.textSecondary,
  },
});
