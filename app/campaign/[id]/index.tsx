import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, Clipboard, ScrollView,
  ActivityIndicator, Platform, Modal, Pressable, TextInput, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, regenerateJoinCode, getCampaignMembers,
  removeCampaignMember, uploadCampaignCover, getCharacterById,
  updateCampaignContentSource, getActiveSession, startSession,
  endSession, getSessionParticipants,
} from '@vaultstone/api';
import { getSourcesByCampaign } from '@vaultstone/content';
import type { LocalSource } from '@vaultstone/content';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing, ImageCropModal } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';
import type { Dnd5eStats } from '@vaultstone/types';
import CharacterPickerModal from '../../../components/campaign/CharacterPickerModal';
import { StartSessionModal, type StartSessionPlayer } from '../../../components/session/StartSessionModal';
import { EndSessionModal } from '../../../components/session/EndSessionModal';
import { SessionNotesPanel } from '../../../components/session/SessionNotesPanel';
import { SessionHistoryCard } from '../../../components/session/SessionHistoryCard';
import { SessionLogCard } from '../../../components/session/SessionLogCard';
import { CampaignNotesCard } from '../../../components/notes/CampaignNotesCard';

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

type ContentSource = { key: string; label: string };

const PRESETS: ContentSource[] = [
  { key: 'srd_5_1', label: 'SRD 5.1 — D&D 5e (2014)' },
  { key: 'srd_2_0', label: 'SRD 2.0 — D&D 5e (2024 Revised)' },
  { key: 'custom', label: 'Custom' },
];

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
    campaigns.find((c) => c.id === id) ?? null,
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [characterMap, setCharacterMap] = useState<Record<string, { name: string; subtitle: string }>>({});
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const isDM = campaign?.dm_user_id === user?.id;
  const myMember = members.find((m) => m.user_id === user?.id);
  const [uploading, setUploading] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [membersModal, setMembersModal] = useState(false);
  const [systemModal, setSystemModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState('srd_5_1');
  const [customLabel, setCustomLabel] = useState('');
  const [localSources, setLocalSources] = useState<LocalSource[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [startModal, setStartModal] = useState(false);
  const [endModal, setEndModal] = useState(false);
  const [sessionParticipants, setSessionParticipants] = useState<string[]>([]);

  // --- actions ---

  async function uploadCover(uri: string, mime: string) {
    if (!campaign) return;
    setUploading(true);
    const { url } = await uploadCampaignCover(campaign.id, uri, mime);
    setUploading(false);
    if (url) {
      const updated = { ...campaign, cover_image_url: url };
      setCampaign(updated);
      setActiveCampaign(updated);
      setCampaigns(campaigns.map((c) => (c.id === campaign.id ? updated : c)));
    }
  }

  async function handlePickCover() {
    if (!campaign) return;
    const isWeb = Platform.OS === 'web';
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: !isWeb,
      aspect: [16, 9],
      quality: 0.5,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (isWeb) {
      setCropUri(asset.uri);
    } else {
      await uploadCover(asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  }

  async function handleCropConfirm(croppedUri: string) {
    setCropUri(null);
    await uploadCover(croppedUri, 'image/jpeg');
  }

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
      router.push('/(drawer)/campaigns');
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

  async function handleConfirmStart(pickedUserIds: string[]) {
    if (!campaign || startingSession) return;
    setStartingSession(true);
    const { data } = await startSession(campaign.id, pickedUserIds);
    setStartingSession(false);
    if (data) {
      setActiveSessionId(data.id);
      setSessionParticipants(pickedUserIds);
      setStartModal(false);
    }
  }

  async function handleConfirmEnd() {
    if (!activeSessionId || endingSession) return;
    setEndingSession(true);
    const { error } = await endSession(activeSessionId);
    setEndingSession(false);
    if (!error) {
      setActiveSessionId(null);
      setSessionParticipants([]);
      setEndModal(false);
    }
  }

  async function handleSaveSystem() {
    if (!campaign) return;
    let source: ContentSource | null = null;
    if (selectedKey === 'custom') {
      const label = customLabel.trim();
      if (label) source = { key: 'custom', label };
    } else {
      source = PRESETS.find((p) => p.key === selectedKey) ?? null;
    }
    const { error } = await updateCampaignContentSource(campaign.id, source);
    if (!error) {
      const updated = { ...campaign, content_sources: source, system_label: source?.label ?? null };
      setCampaign(updated);
      setActiveCampaign(updated);
      setCampaigns(campaigns.map((c) => (c.id === campaign.id ? updated : c)));
      setSystemModal(false);
    }
  }

  // --- data loading ---

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
    getSourcesByCampaign(id).then(setLocalSources).catch(() => {});
  }, [id]);

  // Refresh active-session state every time the screen is focused — so that
  // bailing out of the session screen back here reflects an End Session.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getActiveSession(id).then(async ({ data }) => {
        setActiveSessionId(data?.id ?? null);
        if (data?.id) {
          const ids = await getSessionParticipants(data.id);
          setSessionParticipants(ids);
        } else {
          setSessionParticipants([]);
        }
      });
    }, [id])
  );

  useEffect(() => {
    if (!id) return;
    getCampaignMembers(id).then(async ({ data }) => {
      if (!data) return;
      setMembers(data as Member[]);

      // Fetch character info for members with assigned characters
      const charIds = (data as Member[])
        .map((m) => m.character_id)
        .filter((cid): cid is string => !!cid);
      if (charIds.length === 0) return;

      const map: Record<string, { name: string; subtitle: string }> = {};
      await Promise.all(
        charIds.map(async (cid) => {
          const { data: char } = await getCharacterById(cid);
          if (!char) return;
          const stats = char.base_stats as Record<string, unknown> | null;
          const parts: string[] = [];
          if (stats && typeof stats.classKey === 'string')
            parts.push(stats.classKey.charAt(0).toUpperCase() + stats.classKey.slice(1));
          if (stats && typeof stats.level === 'number')
            parts.push(`Lvl ${stats.level}`);
          map[cid] = { name: char.name, subtitle: parts.join(' · ') || char.system };
        }),
      );
      setCharacterMap(map);
    });
  }, [id]);

  // --- loading state ---

  if (!campaign) {
    return (
      <View style={s.loadingContainer}>
        <Text style={s.textSecondary}>Loading...</Text>
      </View>
    );
  }

  const playerCount = members.filter((m) => m.role === 'player').length;

  const participantSet = new Set(sessionParticipants);
  const isParticipant = !!user && participantSet.has(user.id);
  const canSeeLiveSession = !!activeSessionId && (isDM || isParticipant);
  const participantNames = sessionParticipants
    .map((uid) => members.find((m) => m.user_id === uid)?.profiles?.display_name ?? 'Unknown');

  const displayNameByUserId: Record<string, string> = {};
  for (const m of members) {
    displayNameByUserId[m.user_id] = m.profiles?.display_name ?? 'Anonymous';
  }

  const startModalPlayers: StartSessionPlayer[] = members
    .filter((m) => m.role !== 'gm')
    .map((m) => ({
      userId: m.user_id,
      displayName: m.profiles?.display_name ?? 'Anonymous',
      characterName: m.character_id ? (characterMap[m.character_id]?.name ?? null) : null,
    }));

  const isWeb = Platform.OS === 'web';

  // --- render ---

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container}>
      <TouchableOpacity onPress={() => router.push('/(drawer)/campaigns')} style={s.back}>
        <Text style={s.backText}>← Campaigns</Text>
      </TouchableOpacity>

      <View style={s.grid}>
        {/* ---- Hero card (cover + description + session status) ---- */}
        <View style={s.coverCard}>
          <TouchableOpacity
            onPress={isDM ? handlePickCover : undefined}
            activeOpacity={isDM ? 0.7 : 1}
            disabled={!isDM || uploading}
          >
            {campaign.cover_image_url ? (
              <Image source={{ uri: campaign.cover_image_url }} style={s.coverImage} />
            ) : (
              <View style={s.coverPlaceholder}>
                {isDM && !uploading && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="image-plus" size={28} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Add cover image</Text>
                  </View>
                )}
                {uploading && <ActivityIndicator color={colors.brand} />}
              </View>
            )}
            <View style={s.coverOverlay} />
            <View style={s.coverContent}>
              <Text style={s.coverTitle} numberOfLines={2}>{campaign.name}</Text>
              <View style={s.coverMeta}>
                <Text style={s.coverBadge}>{isDM ? 'DM' : 'Player'}</Text>
                {campaign.system_label ? (
                  <Text style={s.coverSystem}>{campaign.system_label}</Text>
                ) : null}
              </View>
            </View>
            {isDM && campaign.cover_image_url && (
              <View style={s.coverEditBtn}>
                <MaterialCommunityIcons name="camera-outline" size={16} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {/* Hero body: description + session */}
          <View style={s.heroBody}>
            {campaign.description ? (
              <Text style={s.descText}>{campaign.description}</Text>
            ) : null}

            {canSeeLiveSession ? (
              <View style={s.heroSessionRow}>
                <View style={s.sessionStatusDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.heroSessionTitle}>Session live</Text>
                  {participantNames.length > 0 && (
                    <Text style={s.heroSessionMeta} numberOfLines={1}>
                      {participantNames.join(', ')}
                    </Text>
                  )}
                </View>
                {isDM && (
                  <TouchableOpacity
                    style={s.heroEndBtn}
                    onPress={() => setEndModal(true)}
                  >
                    <MaterialCommunityIcons name="stop-circle-outline" size={14} color={colors.hpDanger} />
                    <Text style={s.heroEndBtnText}>End</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : !activeSessionId && isDM ? (
              <TouchableOpacity
                style={s.heroStartBtn}
                onPress={() => setStartModal(true)}
                disabled={startingSession}
              >
                <MaterialCommunityIcons name="play" size={16} color="#fff" />
                <Text style={s.heroStartBtnText}>Start Session</Text>
              </TouchableOpacity>
            ) : !activeSessionId ? (
              <Text style={s.heroSessionIdle}>No active session</Text>
            ) : null}
          </View>
        </View>

        {/* ---- System card ---- */}
        {(() => {
          const src = campaign.content_sources as ContentSource | null;
          const label = src?.label ?? campaign.system_label;
          const isOpen = src && (src.key === 'srd_5_1' || src.key === 'srd_2_0');

          return (
            <View style={s.infoCard}>
              <MaterialCommunityIcons name="dice-d20-outline" size={24} color={colors.brand} />
              <Text style={s.infoLabel}>System</Text>
              <Text style={s.systemValue}>{label || 'Not set'}</Text>
              {isOpen && (
                <Text style={s.openBadge}>Open License (CC-BY 4.0)</Text>
              )}

              {/* Per-PDF rows — visible to all members */}
              {label && (
                <>
                  {localSources.map((src) => (
                    <TouchableOpacity
                      key={src.id}
                      style={s.rulebookPdfRow}
                      onPress={() =>
                        router.push(
                          `/campaign/${id}/pdf-viewer?sourceId=${src.id}` as never,
                        )
                      }
                    >
                      <MaterialCommunityIcons name="file-pdf-box" size={16} color={colors.brand} />
                      <Text style={s.rulebookPdfName} numberOfLines={1}>{src.file_name}</Text>
                      <View style={s.rulebookReadBtn}>
                        <Text style={s.rulebookReadBtnText}>Read</Text>
                      </View>
                    </TouchableOpacity>
                  ))}

                  {/* Upload prompt when no PDFs yet */}
                  {localSources.length === 0 && (
                    <TouchableOpacity
                      style={s.rulebookUploadRow}
                      onPress={() => router.push(`/campaign/${id}/rulebook` as never)}
                    >
                      <MaterialCommunityIcons name="tray-arrow-up" size={15} color={colors.textSecondary} />
                      <Text style={s.rulebookUploadText}>Upload your copy to read in-app</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              <TouchableOpacity
                style={s.manageBtn}
                onPress={() => router.push(`/campaign/${id}/rulebook` as never)}
              >
                <MaterialCommunityIcons name="book-open-page-variant-outline" size={16} color={colors.brand} />
                <Text style={s.manageBtnText}>Rulebook</Text>
              </TouchableOpacity>

              {localSources.length > 0 && (
                <TouchableOpacity
                  style={[s.manageBtn, { borderTopWidth: 0, paddingTop: spacing.sm }]}
                  onPress={() => router.push(`/campaign/${id}/search` as never)}
                >
                  <MaterialCommunityIcons name="magnify" size={16} color={colors.brand} />
                  <Text style={s.manageBtnText}>Search Content</Text>
                </TouchableOpacity>
              )}

              {isDM && (
                <TouchableOpacity
                  style={[s.manageBtn, { borderTopWidth: 0, paddingTop: spacing.sm }]}
                  onPress={() => {
                    if (src) {
                      setSelectedKey(src.key);
                      setCustomLabel(src.key === 'custom' ? src.label : '');
                    } else {
                      setSelectedKey('srd_5_1');
                      setCustomLabel('');
                    }
                    setSystemModal(true);
                  }}
                >
                  <MaterialCommunityIcons name="cog-outline" size={16} color={colors.brand} />
                  <Text style={s.manageBtnText}>Manage System</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {/* ---- Party card ---- */}
        <View style={s.infoCard}>
          <View style={s.memberHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <MaterialCommunityIcons name="shield-sword-outline" size={24} color={colors.brand} />
              <Text style={s.infoLabel}>Party</Text>
            </View>
            <View style={s.dmTag}>
              <Text style={s.dmTagLabel}>DM</Text>
              <Text style={s.dmTagName} numberOfLines={1}>
                {members.find((m) => m.role === 'gm')?.profiles?.display_name ?? 'Anonymous'}
              </Text>
            </View>
          </View>

          {(() => {
            const players = members.filter((m) => m.role !== 'gm');
            if (players.length === 0) {
              return <Text style={s.infoSubtext}>No players yet</Text>;
            }
            return (
              <View style={s.partyList}>
                {players.map((m) => {
                  const char = m.character_id ? characterMap[m.character_id] : null;
                  const isMe = m.user_id === user?.id;
                  const Row = isMe ? TouchableOpacity : View;
                  return (
                    <Row
                      key={m.user_id}
                      style={s.partyRow}
                      {...(isMe ? { onPress: () => setPickerVisible(true), activeOpacity: 0.7 } : {})}
                    >
                      <MaterialCommunityIcons
                        name={char ? 'account-circle-outline' : 'account-alert-outline'}
                        size={20}
                        color={char ? colors.brand : colors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.partyCharName}>
                          {char ? char.name : isMe ? 'Link a character' : 'No character'}
                        </Text>
                        <Text style={s.partyPlayerName}>
                          {m.profiles?.display_name ?? 'Anonymous'}
                          {char ? ` · ${char.subtitle}` : ''}
                        </Text>
                      </View>
                      {isMe && (
                        <Text style={s.partyMeAction}>{char ? 'Change' : 'Link'}</Text>
                      )}
                    </Row>
                  );
                })}
              </View>
            );
          })()}

          <TouchableOpacity
            style={s.manageBtn}
            onPress={() => router.push(`/campaign/${id}/party` as never)}
          >
            <MaterialCommunityIcons name="account-group-outline" size={16} color={colors.brand} />
            <Text style={s.manageBtnText}>View Party</Text>
          </TouchableOpacity>

          {isDM ? (
            <TouchableOpacity
              style={[s.manageBtn, { borderTopWidth: 0, paddingTop: spacing.sm }]}
              onPress={() => setMembersModal(true)}
            >
              <MaterialCommunityIcons name="cog-outline" size={16} color={colors.brand} />
              <Text style={s.manageBtnText}>Manage Members</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleLeave}
              style={[s.manageBtn, { borderTopWidth: 0, paddingTop: spacing.sm }]}
            >
              <Text style={s.leaveText}>Leave Campaign</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ---- Combat Encounter card (only when session is live AND viewer included) ---- */}
        {canSeeLiveSession && (
          <View style={s.infoCard}>
            <MaterialCommunityIcons name="sword-cross" size={24} color={colors.brand} />
            <Text style={s.infoLabel}>Combat Encounter</Text>
            <Text style={s.infoSubtext}>Initiative tracker &amp; turn order</Text>
            <TouchableOpacity
              style={s.sessionPrimaryBtn}
              onPress={() => router.push(`/campaign/${id}/combat` as never)}
            >
              <MaterialCommunityIcons name="sword" size={16} color="#fff" />
              <Text style={s.sessionPrimaryBtnText}>Open Combat Encounter</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ---- Session Notes panel (web, inline when live + viewer included) ---- */}
        {canSeeLiveSession && isWeb && user && activeSessionId && (
          <View style={s.notesInlineSlot}>
            <SessionNotesPanel
              sessionId={activeSessionId}
              userId={user.id}
              campaignId={campaign.id}
            />
          </View>
        )}

        {/* ---- Campaign Notes Hub (DM-only placeholder) ---- */}
        {isDM && <CampaignNotesCard campaignId={campaign.id} />}

        {/* ---- Session Log (live when a session is active, last session otherwise) ---- */}
        <SessionLogCard campaignId={campaign.id} />

        {/* ---- Session History ---- */}
        <SessionHistoryCard campaignId={campaign.id} displayNameByUserId={displayNameByUserId} />
      </View>

      {/* ---- Session Notes FAB (native, when live + viewer included) ---- */}
      {canSeeLiveSession && !isWeb && activeSessionId && (
        <TouchableOpacity
          style={s.notesFab}
          onPress={() => router.push(`/campaign/${campaign.id}/notes` as never)}
        >
          <MaterialCommunityIcons name="notebook-outline" size={24} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ======== Character Picker Modal ======== */}
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

      {/* ======== Manage Members Modal ======== */}
      <Modal visible={membersModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setMembersModal(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Manage Members</Text>
              <TouchableOpacity onPress={() => setMembersModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Join Code */}
            <View style={s.modalSection}>
              <Text style={s.infoLabel}>Join Code</Text>
              <View style={s.joinCodeRow}>
                <Text style={s.codeValue}>{campaign.join_code}</Text>
                <TouchableOpacity onPress={copyJoinCode} style={s.codeBtn}>
                  <Text style={s.codeBtnText}>{copied ? 'Copied!' : 'Copy'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRegenerateCode} disabled={regenerating}>
                  <Text style={s.codeBtnTextSecondary}>
                    {regenerating ? '...' : 'Regenerate'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={s.joinCodeHint}>Share this code to invite players</Text>
            </View>

            {/* Member list */}
            <View style={s.modalSection}>
              <Text style={s.infoLabel}>Members</Text>
              {members.map((m) => {
                const char = m.character_id ? characterMap[m.character_id] : null;
                return (
                  <View key={m.user_id} style={s.modalMemberRow}>
                    <View style={{ flex: 1 }}>
                      <View style={s.modalMemberTop}>
                        <Text style={s.memberName} numberOfLines={1}>
                          {m.profiles?.display_name ?? 'Anonymous'}
                        </Text>
                        <Text style={s.memberBadge}>{ROLE_LABEL[m.role] ?? m.role}</Text>
                      </View>
                      {m.role !== 'gm' && (
                        <Text style={s.modalMemberChar} numberOfLines={1}>
                          {char ? `Playing: ${char.name} (${char.subtitle})` : 'No character assigned'}
                        </Text>
                      )}
                    </View>
                    {m.user_id !== user?.id && (
                      <TouchableOpacity onPress={() => handleRemove(m.user_id)}>
                        <Text style={s.removeText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ======== Manage System Modal ======== */}
      <Modal visible={systemModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setSystemModal(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Manage System</Text>
              <TouchableOpacity onPress={() => setSystemModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={s.modalSection}>
              <Text style={s.infoLabel}>Rulebook Source</Text>
              {PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.key}
                  style={s.presetRow}
                  onPress={() => setSelectedKey(preset.key)}
                >
                  <MaterialCommunityIcons
                    name={selectedKey === preset.key ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20}
                    color={selectedKey === preset.key ? colors.brand : colors.textSecondary}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.presetLabel, selectedKey === preset.key && s.presetLabelActive]}>
                      {preset.key === 'custom' ? 'Custom / Other' : preset.label}
                    </Text>
                    {(preset.key === 'srd_5_1' || preset.key === 'srd_2_0') && (
                      <Text style={s.presetSub}>Bundled · Open License (CC-BY 4.0)</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}

              {selectedKey === 'custom' && (
                <TextInput
                  style={[s.modalInput, { marginTop: spacing.sm }]}
                  value={customLabel}
                  onChangeText={setCustomLabel}
                  placeholder="e.g. Pathfinder 2e, Call of Cthulhu"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />
              )}
            </View>

            <TouchableOpacity
              style={[s.modalSaveBtn, selectedKey === 'custom' && !customLabel.trim() && s.modalSaveBtnDisabled]}
              onPress={handleSaveSystem}
              disabled={selectedKey === 'custom' && !customLabel.trim()}
            >
              <Text style={s.modalSaveBtnText}>Save</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ======== Crop Modal ======== */}
      {cropUri && (
        <ImageCropModal
          visible
          imageUri={cropUri}
          aspect={[16, 9]}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropUri(null)}
        />
      )}

      {/* ======== Start Session Modal ======== */}
      <StartSessionModal
        visible={startModal}
        players={startModalPlayers}
        starting={startingSession}
        onClose={() => setStartModal(false)}
        onConfirm={handleConfirmStart}
      />

      {/* ======== End Session Modal ======== */}
      <EndSessionModal
        visible={endModal}
        ending={endingSession}
        onClose={() => setEndModal(false)}
        onConfirm={handleConfirmEnd}
      />
    </ScrollView>
  );
}

const CARD_BASE = {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: 14,
  overflow: 'hidden' as const,
};

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { paddingBottom: 48 },
  loadingContainer: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  back: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backText: { color: colors.brand, fontSize: 14 },

  // Grid — flex-start so each card is its natural height (not stretched
  // to match the tallest sibling in the row).
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: spacing.md, paddingHorizontal: spacing.lg,
  },

  // Cover card
  coverCard: {
    ...CARD_BASE, width: '100%', maxWidth: 480, position: 'relative',
  },
  coverImage: { width: '100%', aspectRatio: 16 / 9 },
  coverPlaceholder: {
    width: '100%', aspectRatio: 16 / 9,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  coverContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.md,
  },
  coverTitle: {
    fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 6,
  },
  coverMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  coverBadge: {
    fontSize: 11, fontWeight: '700', color: '#fff',
    borderColor: 'rgba(255,255,255,0.4)', borderWidth: 1,
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
  },
  coverSystem: { fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  coverEditBtn: {
    position: 'absolute', top: spacing.sm, right: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, padding: 5,
  },

  // Hero body (below cover image)
  heroBody: {
    padding: spacing.md, gap: spacing.sm,
  },
  heroSessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
  },
  sessionStatusDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: colors.hpHealthy,
  },
  heroSessionTitle: {
    fontSize: 13, fontWeight: '700', color: colors.hpHealthy,
  },
  heroSessionMeta: {
    fontSize: 11, color: colors.textSecondary, marginTop: 1,
  },
  heroEndBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderColor: colors.hpDanger, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  heroEndBtnText: { fontSize: 11, color: colors.hpDanger, fontWeight: '700' },
  heroStartBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 8, paddingVertical: 9,
  },
  heroStartBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  heroSessionIdle: {
    fontSize: 12, color: colors.textSecondary, fontStyle: 'italic',
  },

  // Info cards
  infoCard: {
    ...CARD_BASE, padding: spacing.md,
    minWidth: 160, flex: 1, flexBasis: 160, gap: 6,
  },
  infoValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  infoLabel: {
    fontSize: 12, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  infoSubtext: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

  // System card
  systemValue: {
    fontSize: 18, fontWeight: '600', color: colors.textPrimary, marginTop: 4,
  },
  openBadge: {
    fontSize: 11, color: colors.hpHealthy, fontWeight: '600', marginTop: 2,
  },
  presetRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  presetLabel: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  presetLabelActive: { color: colors.textPrimary, fontWeight: '600' },
  presetSub: { fontSize: 11, color: colors.hpHealthy, marginTop: 1 },

  // Member card
  memberHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  dmTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.background, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  dmTagLabel: { fontSize: 11, fontWeight: '700', color: colors.brand },
  dmTagName: { fontSize: 12, color: colors.textPrimary, maxWidth: 120 },
  memberSection: { marginTop: spacing.sm },
  memberSectionLabel: {
    fontSize: 11, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  memberName: { fontSize: 14, color: colors.textPrimary, lineHeight: 22, flex: 1 },
  memberNameDim: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic' },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  memberBadge: {
    fontSize: 10, color: colors.textSecondary,
    borderColor: colors.border, borderWidth: 1,
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  removeText: { fontSize: 12, color: colors.hpDanger },

  // Per-PDF rows (inside system card)
  rulebookPdfRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.background, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: 7,
  },
  rulebookPdfName: {
    flex: 1, fontSize: 12, color: colors.textPrimary, fontWeight: '500',
  },
  rulebookReadBtn: {
    backgroundColor: colors.brand, borderRadius: 5,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  rulebookReadBtnText: {
    fontSize: 11, color: '#fff', fontWeight: '700',
  },
  rulebookUploadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.background, borderRadius: 8,
    paddingHorizontal: spacing.sm, paddingVertical: 7,
  },
  rulebookUploadText: {
    flex: 1, fontSize: 12, color: colors.textSecondary,
  },

  // Manage button (bottom of cards)
  manageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 'auto', paddingTop: spacing.md,
    borderTopColor: colors.border, borderTopWidth: 1,
  },
  manageBtnText: { fontSize: 13, color: colors.brand, fontWeight: '600' },
  leaveText: { fontSize: 13, color: colors.hpDanger },

  // Session notes panel (inline on web)
  notesInlineSlot: {
    flexBasis: 320, flexGrow: 1, minWidth: 260,
  },

  // Session notes FAB (native)
  notesFab: {
    position: 'absolute', bottom: 24, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },

  // Session card primary action (Start / Rejoin)
  sessionLiveText: {
    fontSize: 14, fontWeight: '600', color: colors.hpHealthy, marginTop: 2,
  },
  sessionPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.sm, backgroundColor: colors.brand, borderRadius: 8,
    paddingVertical: 9,
  },
  sessionPrimaryBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // Join code (inside modal)
  joinCodeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  codeValue: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, letterSpacing: 2 },
  codeBtn: {
    borderColor: colors.border, borderWidth: 1,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  codeBtnText: { color: colors.brand, fontSize: 12, fontWeight: '600' },
  codeBtnTextSecondary: { color: colors.textSecondary, fontSize: 12, paddingVertical: 4 },
  joinCodeHint: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs },

  // Party card
  partyList: { marginTop: spacing.sm, gap: 2 },
  partyRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  partyCharName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  partyPlayerName: { fontSize: 12, color: colors.textSecondary },
  partyMeAction: { fontSize: 12, color: colors.brand, fontWeight: '600' },

  // Modal member rows
  modalMemberRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  modalMemberTop: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  modalMemberChar: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Description
  descText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: 4 },

  // Modals
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderColor: colors.border, borderWidth: 1,
    width: '90%', maxWidth: 460, padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  modalSection: { marginBottom: spacing.lg },
  modalInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 15, marginTop: spacing.sm,
  },
  modalSaveBtn: {
    backgroundColor: colors.brand, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  modalSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalSaveBtnDisabled: { opacity: 0.4 },

  textSecondary: { color: colors.textSecondary },
});
