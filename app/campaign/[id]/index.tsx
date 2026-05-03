import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, Clipboard, ScrollView,
  ActivityIndicator, Platform, Modal, Pressable, StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  supabase, regenerateJoinCode, getCampaignMembers,
  removeCampaignMember, uploadCampaignCover,
  getActiveSession, startSession,
  endSession, getSessionParticipants,
  listCampaignPacks, type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore, useCampaignStore } from '@vaultstone/store';
import { colors, spacing, ImageCropModal } from '@vaultstone/ui';
import { dnd5e2014System, dnd5e2024System, customSystem } from '@vaultstone/systems';
import { CampaignPacksCard } from '../../../components/campaign/CampaignPacksCard';
import { ManageCampaignContentModal } from '../../../components/campaign/ManageCampaignContentModal';
import type { Database } from '@vaultstone/types';
import type { Dnd5eStats } from '@vaultstone/types';
import CharacterPickerModal from '../../../components/campaign/CharacterPickerModal';
import { StartSessionModal, type StartSessionPlayer } from '../../../components/session/StartSessionModal';
import { EndSessionModal } from '../../../components/session/EndSessionModal';
import { SessionNotesPanel } from '../../../components/session/SessionNotesPanel';
import { SessionHistoryCard } from '../../../components/session/SessionHistoryCard';
import { SessionLogCard } from '../../../components/session/SessionLogCard';
import { CampaignNotesCard } from '../../../components/notes/CampaignNotesCard';
import { CampaignWorldsCard } from '../../../components/world/CampaignWorldsCard';
import { CampaignWorldLookupDrawer } from '../../../components/world/CampaignWorldLookupDrawer';

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type Character = Database['public']['Tables']['characters']['Row'];

type Member = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  joined_at: string;
  profiles: { id: string; display_name: string | null } | null;
  characters: { id: string; name: string; system: string; base_stats: unknown } | null;
};

// Lookup table for the campaign's system id → bundled definition. Used
// by the System card to render the proper display name + version +
// license. 'dnd5e' is the legacy alias for the 2024 system (existing
// characters all reference it); we treat it as 5e 2024 for display.
const BUNDLED_BY_SYSTEM_ID: Record<string, typeof dnd5e2024System> = {
  dnd5e:       dnd5e2024System,
  dnd5e_2014:  dnd5e2014System,
  dnd5e_2024:  dnd5e2024System,
  custom:      customSystem,
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
  const { campaigns, setActiveCampaign, updateCampaign, removeCampaign } = useCampaignStore();
  const [campaign, setCampaign] = useState<Campaign | null>(
    campaigns.find((c) => c.id === id) ?? null,
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const isDM = campaign?.dm_user_id === user?.id;
  const myMember = members.find((m) => m.user_id === user?.id);
  const [uploading, setUploading] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const [membersModal, setMembersModal] = useState(false);
  // Enabled packs for this campaign — drives the System Card's "N packs
  // enabled" line and the View Content Packs modal. Refreshed when the
  // CampaignPacksCard fires its onChanged callback (still populated from
  // that card's own list query for the management UI).
  const [enabledPacks, setEnabledPacks] = useState<HomebrewPackRow[]>([]);
  const [packsDetailOpen, setPacksDetailOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [worldLookupOpen, setWorldLookupOpen] = useState(false);
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
      updateCampaign(campaign.id, { cover_image_url: url });
      setCampaign((prev) => (prev ? { ...prev, cover_image_url: url } : prev));
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
      updateCampaign(campaign.id, { join_code: code });
      setCampaign((prev) => (prev ? { ...prev, join_code: code } : prev));
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
      removeCampaign(campaign.id);
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
                ? { id: character.id, name: character.name, system: character.system, base_stats: character.base_stats }
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

  // Enabled-packs fetch drives the System Card's "N packs enabled" line
  // and the View Content Packs modal. Refreshed when CampaignPacksCard
  // signals a change (toggle on/off, add/remove pack).
  const refreshEnabledPacks = useCallback(async () => {
    if (!id) return;
    const { data } = await listCampaignPacks(id);
    const packs = (data ?? [])
      .filter((row) => row.enabled)
      .map((row) => row.homebrew_packs as unknown as HomebrewPackRow);
    setEnabledPacks(packs);
  }, [id]);

  useEffect(() => {
    refreshEnabledPacks();
  }, [refreshEnabledPacks]);

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
    getCampaignMembers(id).then(({ data }) => {
      if (data) setMembers(data as Member[]);
    });
  }, [id]);

  // Derived from the characters join already selected by getCampaignMembers —
  // no second round-trip per character.
  const characterMap = useMemo(() => {
    const map: Record<string, { name: string; subtitle: string }> = {};
    for (const m of members) {
      if (!m.character_id || !m.characters) continue;
      const stats = m.characters.base_stats as Record<string, unknown> | null;
      const parts: string[] = [];
      if (stats && typeof stats.classKey === 'string')
        parts.push(stats.classKey.charAt(0).toUpperCase() + stats.classKey.slice(1));
      if (stats && typeof stats.level === 'number')
        parts.push(`Lvl ${stats.level}`);
      map[m.character_id] = {
        name: m.characters.name,
        subtitle: parts.join(' · ') || m.characters.system,
      };
    }
    return map;
  }, [members]);

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

        {/* ---- System card ----
            Read-only summary of the campaign's content stack: which game
            system + how many content packs are currently enabled. Three
            actions: jump to the system library, view the campaign's enabled
            packs in detail, or (DM-only) manage the system + pack selection. */}
        {(() => {
          const bundledSystem = BUNDLED_BY_SYSTEM_ID[campaign.system];
          const label = bundledSystem?.displayName ?? campaign.system;
          const versionTag = bundledSystem ? `v${bundledSystem.version}` : null;
          const isOpen = bundledSystem?.license === 'CC-BY-4.0';
          const packCount = enabledPacks.length;

          return (
            <View style={s.infoCard}>
              <MaterialCommunityIcons name="dice-d20-outline" size={24} color={colors.brand} />
              <Text style={s.infoLabel}>System</Text>
              <Text style={s.systemValue}>
                {label}{versionTag ? `  ·  ${versionTag}` : ''}
              </Text>
              {isOpen && (
                <Text style={s.openBadge}>Open License (CC-BY 4.0)</Text>
              )}

              <Text style={s.infoLabel}>Content packs</Text>
              <Text style={s.systemValue}>
                {packCount === 0
                  ? 'None enabled'
                  : `${packCount} pack${packCount === 1 ? '' : 's'} enabled`}
              </Text>

              <View style={s.systemActionRow}>
                <TouchableOpacity
                  style={s.systemActionBtn}
                  onPress={() => router.push(`/game-systems/${campaign.system}` as never)}
                >
                  <MaterialCommunityIcons name="dice-d20-outline" size={14} color={colors.brand} />
                  <Text style={s.systemActionBtnText}>View Game System</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.systemActionBtn}
                  onPress={() => setPacksDetailOpen(true)}
                >
                  <MaterialCommunityIcons name="package-variant-closed" size={14} color={colors.brand} />
                  <Text style={s.systemActionBtnText}>View Content Packs</Text>
                </TouchableOpacity>
                {isDM && (
                  <TouchableOpacity
                    style={s.systemActionBtn}
                    onPress={() => setManageOpen(true)}
                  >
                    <MaterialCommunityIcons name="cog-outline" size={14} color={colors.brand} />
                    <Text style={s.systemActionBtnText}>Manage</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })()}

        {/* ---- Content Packs card ---- */}
        <CampaignPacksCard
          campaignId={campaign.id}
          campaignSystem={campaign.system}
          isDM={isDM}
          onChanged={refreshEnabledPacks}
        />

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

        {/* ---- Linked Worlds ---- */}
        <CampaignWorldsCard campaignId={campaign.id} onSearchOpen={() => setWorldLookupOpen(true)} />

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

      {/* ======== View Content Packs Modal ========
          Read-only list of the campaign's enabled packs. Each row routes
          to the per-pack detail page so players can browse the content
          their campaign uses without going through Game Systems. */}
      <Modal visible={packsDetailOpen} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setPacksDetailOpen(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Content Packs in this campaign</Text>
              <TouchableOpacity onPress={() => setPacksDetailOpen(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={s.modalSection}>
              {enabledPacks.length === 0 ? (
                <Text style={s.systemValue}>
                  No packs are enabled for this campaign yet.
                  {isDM ? ' Use Manage to add some.' : ''}
                </Text>
              ) : (
                enabledPacks.map((pack) => (
                  <TouchableOpacity
                    key={pack.id}
                    style={s.packDetailRow}
                    onPress={() => {
                      setPacksDetailOpen(false);
                      router.push(`/homebrew-pack/${pack.id}` as never);
                    }}
                  >
                    <MaterialCommunityIcons
                      name={pack.name.startsWith('Imported: ') ? 'tray-arrow-down' : 'auto-fix'}
                      size={18}
                      color={colors.brand}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.packDetailName} numberOfLines={1}>{pack.name}</Text>
                      {pack.description ? (
                        <Text style={s.packDetailDesc} numberOfLines={2}>{pack.description}</Text>
                      ) : null}
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ======== Manage Modal ========
          DM-only. System picker (locked when characters exist) + pack
          toggles. Bumps refreshEnabledPacks via onChanged so the System
          Card's "N enabled" line stays in sync. */}
      <ManageCampaignContentModal
        visible={manageOpen}
        campaignId={campaign.id}
        currentSystem={campaign.system}
        onClose={() => setManageOpen(false)}
        onChanged={() => {
          refreshEnabledPacks();
          // System change won't reflect on the page until the campaign
          // record itself updates. Refetch the row so the System Card
          // reads the new system without a remount.
          supabase
            .from('campaigns')
            .select('*')
            .eq('id', campaign.id)
            .single()
            .then(({ data }) => {
              if (data) setCampaign(data);
            });
        }}
      />

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

      {/* ======== World Lookup Drawer ======== */}
      {worldLookupOpen && (
        <CampaignWorldLookupDrawer campaignId={campaign.id} onClose={() => setWorldLookupOpen(false)} />
      )}
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
  // System card actions
  systemActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
  },
  systemActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brand + '55',
    backgroundColor: colors.brand + '11',
  },
  systemActionBtnText: { fontSize: 12, color: colors.brand, fontWeight: '600' },

  // Content Packs detail modal — pack rows route to per-pack detail page.
  packDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  packDetailName: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  packDetailDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

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

  textSecondary: { color: colors.textSecondary },
});
