// Campaign page — landing/decision hub for one campaign.
//
// Phase-aware layout:
//   • Setup mode  — DM-only checklist (world / packs / character rules)
//                   gated until everything is set.
//   • Open mode   — steady-state hub. DM sees session controls + party
//                   + recent activity + references; player sees their
//                   character, party, and activity.
//   • In-session  — same layout, but the window pane goes live above
//                   the rest and Start Session swaps to End Session.
//
// "V2" in the component name is historical — this layout replaced the
// original dashboard once it reached parity. Renamed to drop the
// version suffix is a follow-up rename pass; for now we keep the
// import path stable.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, ActivityIndicator, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import {
  supabase, getCampaignMembers, listCampaignPacks, assignCharacterToCampaign,
  getActiveSession, startSession, endSession,
  getWorldsForCampaign,
  getCampaignCharacterRules,
  resolveRuleValues,
  removeCampaignMember,
  deleteCampaign,
  getCharactersForCampaign,
  uploadCampaignCover,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { BUNDLED_SYSTEMS_BY_ID } from '@vaultstone/systems';
import { CharacterCreationRulesModal } from './CharacterCreationRulesModal';
import { useAuthStore, useCampaignStore, useSplitPaneStore } from '@vaultstone/store';
import {
  colors, spacing, radius,
  Card, ContentWidth, GhostButton, GradientButton, Icon, ImageCropModal,
  MetaLabel, Text,
} from '@vaultstone/ui';
import type { Database, Dnd5eStats, CharacterSettings } from '@vaultstone/types';
import { CampaignMembersCard } from './CampaignMembersCard';
import { CampaignWindowPane } from './CampaignWindowPane';
import { LinkWorldModal } from './LinkWorldModal';
import { ManageCampaignContentModal } from './ManageCampaignContentModal';
import { ManageMembersModal } from './ManageMembersModal';
import { PartyMemberCard } from './PartyMemberCard';
import { StartSessionModal, type StartSessionPlayer } from '../session/StartSessionModal';
import { EndSessionModal } from '../session/EndSessionModal';
import { useFloatingNotes } from '../session/FloatingNotesContext';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

/** Full character payload — every `characters.campaign_id` pointing
 *  at this campaign. Shape matches `getCharactersForCampaign`. */
type CampaignCharacter = {
  id: string;
  user_id: string;
  name: string;
  base_stats: unknown;
  resources: unknown;
  conditions: string[] | null;
  avatar_url: string | null;
  avatar_card_url: string | null;
};

type Member = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  joined_at: string;
  profiles: { id: string; display_name: string | null } | null;
  characters: {
    id: string;
    name: string;
    system: string;
    base_stats: unknown;
    resources: unknown;
    conditions: string[] | null;
    avatar_url: string | null;
    avatar_card_url: string | null;
  } | null;
};

type Phase = 'setup' | 'open' | 'in-session';

type Props = {
  campaignId: string;
};

export function CampaignPageV2({ campaignId }: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  // Campaign-store updates mirror local edits to the page-level
  // campaign state (cover URL change, leaving the campaign) so
  // other surfaces (drawer list, home page) reflect them on next
  // mount without a full refetch.
  const updateCampaignInStore = useCampaignStore((s) => s.updateCampaign);
  const removeCampaignFromStore = useCampaignStore((s) => s.removeCampaign);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  // Full per-campaign character roster (every `characters.campaign_id`
  // pointing here). Drives both the Members card (grouped by user)
  // and the Party card (vitals rendering). Replaces the older
  // membership-pinned `Member.characters` payload for party rendering;
  // the membership join is still loaded for role + profile data.
  const [campaignCharacters, setCampaignCharacters] = useState<
    Array<CampaignCharacter>
  >([]);
  const [packs, setPacks] = useState<HomebrewPackRow[]>([]);
  const [linkedWorld, setLinkedWorld] = useState<{ id: string; name: string } | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  /** Whether the DM has saved character-creation rules at least once.
   *  The DB column defaults to `{}`, so we treat "any keys present"
   *  as the explicit-acknowledge gate. The modal saves the full
   *  resolved set on commit, so post-save the bag always has every
   *  rule key. */
  const [rulesSet, setRulesSet] = useState(false);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  const [worldModalOpen, setWorldModalOpen] = useState(false);
  /** Manage Content modal — handles both system swap and pack
   *  attach/enable in a single surface. Opened by the System and
   *  Content packs checklist rows + the references row's pack CTA. */
  const [contentModalOpen, setContentModalOpen] = useState(false);
  /** Manage Members modal — DM-only join code + member list with
   *  remove. Opened by the Party panel's "Manage members" CTA. */
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  /** Start / End session modals — DM-only. Start lets the DM pick
   *  which players are present; End confirms with an optional
   *  summary. Both share the page-level activeSessionId state. */
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  /** Leave-campaign confirmation — players only. Removing yourself
   *  drops your campaign membership and routes back to the
   *  campaigns list. */
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadingFlags, setLoadingFlags] = useState({ campaign: true, world: true, members: true, rules: true });
  // Bumped to refresh derived surfaces (window pane, party list) after
  // a write that affects them (e.g. clear scene, add member).
  const [refreshTick, setRefreshTick] = useState(0);

  const isDM = !!campaign && campaign.dm_user_id === user?.id;
  const myMember = members.find((m) => m.user_id === user?.id);
  const memberNames = useMemo(
    () => new Map(members.map((m) => [m.user_id, m.profiles?.display_name ?? 'Unknown'])),
    [members],
  );
  const floatingNotes = useFloatingNotes();
  const openNotes = useCallback(() => {
    if (!activeSessionId || !user || !campaign) return;
    floatingNotes.open({
      sessionId: activeSessionId,
      userId: user.id,
      campaignId: campaign.id,
      isDM,
      memberNames,
    });
  }, [activeSessionId, user, campaign, isDM, memberNames, floatingNotes]);

  // ── Cover upload ────────────────────────────────────────────────
  // DM-only cover image used as the all-campaigns card cover and as
  // the scene-pane fallback when no scene is pinned. Web flow goes
  // through the crop modal (the cover is rendered 16:9 on cards
  // and full-bleed in the scene pane); native uses the platform
  // crop UI from expo-image-picker.
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverCropUri, setCoverCropUri] = useState<string | null>(null);

  const persistCoverUrl = useCallback(
    async (uri: string, mime: string) => {
      if (!campaign) return;
      setCoverUploading(true);
      const { url, error } = await uploadCampaignCover(campaign.id, uri, mime);
      setCoverUploading(false);
      if (error || !url) return;
      setCampaign((prev) => (prev ? { ...prev, cover_image_url: url } : prev));
      updateCampaignInStore(campaign.id, { cover_image_url: url });
    },
    [campaign, updateCampaignInStore],
  );

  const handlePickCover = useCallback(async () => {
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
      setCoverCropUri(asset.uri);
    } else {
      await persistCoverUrl(asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  }, [campaign, persistCoverUrl]);

  const handleCoverCropConfirm = useCallback(
    async (croppedUri: string) => {
      setCoverCropUri(null);
      await persistCoverUrl(croppedUri, 'image/jpeg');
    },
    [persistCoverUrl],
  );

  // ── Loaders ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();
      if (cancelled) return;
      setCampaign(data ?? null);
      setLoadingFlags((f) => ({ ...f, campaign: false }));
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getWorldsForCampaign(campaignId);
      if (cancelled) return;
      const rows = (data ?? []) as unknown as Array<{
        worlds: { id: string; name: string } | null;
      }>;
      const first = rows.find((r) => r.worlds)?.worlds ?? null;
      setLinkedWorld(first);
      setLoadingFlags((f) => ({ ...f, world: false }));
    })();
    return () => { cancelled = true; };
  }, [campaignId, refreshTick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getCampaignMembers(campaignId);
      if (cancelled) return;
      setMembers((data ?? []) as unknown as Member[]);
      setLoadingFlags((f) => ({ ...f, members: false }));
    })();
    return () => { cancelled = true; };
  }, [campaignId, refreshTick]);

  // Full character roster — every character whose campaign_id points
  // here, regardless of whether it's the user's pinned active one.
  // Powers the Members card so a player with multiple characters on
  // the campaign shows them all (with inactive ones tagged).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getCharactersForCampaign(campaignId);
      if (cancelled) return;
      setCampaignCharacters((data ?? []) as unknown as CampaignCharacter[]);
    })();
    return () => { cancelled = true; };
  }, [campaignId, refreshTick]);

  // Auto-link a user's own character to their campaign_members row
  // when the link is missing but a character pointing here exists.
  // This bridges the "I created Oswald via the wizard but my
  // campaign_members.character_id stayed null" gap that left the
  // big "Create your character" CTA showing even after the character
  // showed up in the party. Picks the first matching character if
  // multiple exist; the user can still rebind via the manage flow.
  useEffect(() => {
    if (!user || !campaign) return;
    if (campaign.dm_user_id === user.id) return; // DMs don't carry character_id
    const myMembership = members.find((m) => m.user_id === user.id);
    if (!myMembership) return;
    if (myMembership.character_id) return;
    const myCharacter = campaignCharacters.find((c) => c.user_id === user.id);
    if (!myCharacter) return;
    let cancelled = false;
    (async () => {
      const { error } = await assignCharacterToCampaign(campaignId, user.id, myCharacter.id);
      if (cancelled || error) return;
      setMembers((prev) =>
        prev.map((m) => m.user_id === user.id ? { ...m, character_id: myCharacter.id } : m),
      );
    })();
    return () => { cancelled = true; };
  }, [campaignId, members, campaignCharacters, user, campaign]);

  // Realtime: watch UPDATEs on every character whose campaign_id points
  // here so both the Party cards (HP / conditions / concentration) and
  // the Members card (active/inactive toggle + name) reflect changes
  // without a refetch. Single channel covers both surfaces since they
  // both consume `campaignCharacters`.
  //
  // Channel name carries a random suffix so React strict-mode's
  // double-mount (and Expo Router's nav remounts) don't reuse the same
  // channel instance — Supabase's `.channel()` returns an already-joined
  // channel if the name is taken, which causes `.on()` to throw
  // "cannot add postgres_changes callbacks after subscribe()".
  const campaignCharIds = useMemo(
    () => campaignCharacters.map((c) => c.id),
    [campaignCharacters],
  );
  const campaignCharIdsKey = campaignCharIds.join(',');
  useEffect(() => {
    if (campaignCharIds.length === 0) return;
    const channelName = `campaign-roster-${campaignId}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'characters', filter: `id=in.(${campaignCharIds.join(',')})` },
        (payload) => {
          const updated = payload.new as CampaignCharacter;
          setCampaignCharacters((prev) => prev.map((c) =>
            c.id === updated.id
              ? {
                  ...c,
                  name: updated.name,
                  base_stats: updated.base_stats,
                  resources: updated.resources,
                  conditions: updated.conditions,
                  avatar_url: updated.avatar_url,
                  avatar_card_url: updated.avatar_card_url,
                }
              : c
          ));
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, campaignCharIdsKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await listCampaignPacks(campaignId);
      if (cancelled) return;
      const enabled = (data ?? [])
        .filter((row) => row.enabled)
        .map((row) => row.homebrew_packs as unknown as HomebrewPackRow);
      setPacks(enabled);
    })();
    return () => { cancelled = true; };
  }, [campaignId, refreshTick]);

  // Read the rules bag — empty object means the DM hasn't saved
  // yet (the migration default), any keys means they have. Bumped
  // by `refreshTick` so the modal's Save callback can re-trigger
  // the read instead of needing to mirror state up.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getCampaignCharacterRules(campaignId);
      if (cancelled) return;
      setRulesSet(!!data && Object.keys(data).length > 0);
      setLoadingFlags((f) => ({ ...f, rules: false }));
    })();
    return () => { cancelled = true; };
  }, [campaignId, refreshTick]);

  // Active-session state — refresh on focus so navigating back from
  // /combat or /sessions reflects an end-session correctly.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data } = await getActiveSession(campaignId);
        if (cancelled) return;
        setActiveSessionId(data?.id ?? null);
      })();
      return () => { cancelled = true; };
    }, [campaignId])
  );

  // ── Phase derivation ─────────────────────────────────────────────
  // Setup is complete when world is linked AND the DM has saved
  // character-creation rules at least once. Packs are optional —
  // SRD-only campaigns are valid.
  const setupComplete = !!linkedWorld && rulesSet;
  const phase: Phase = !setupComplete ? 'setup'
    : activeSessionId ? 'in-session'
    : 'open';

  const stillLoading =
    loadingFlags.campaign || loadingFlags.world || loadingFlags.members || loadingFlags.rules;

  // Pre-shape the player roster for the StartSessionModal — the
  // modal expects a flattened {userId, displayName, characterName}
  // shape rather than the raw Member record. Recomputed cheaply on
  // each render; memoization isn't worth the indirection here.
  const startModalPlayers: StartSessionPlayer[] = members
    .filter((m) => m.role !== 'gm')
    .map((m) => ({
      userId: m.user_id,
      displayName: m.profiles?.display_name ?? 'Anonymous',
      characterName: m.characters?.name ?? null,
    }));

  async function handleConfirmStart(pickedUserIds: string[]) {
    if (startingSession) return;
    setStartingSession(true);
    const { data } = await startSession(campaignId, pickedUserIds);
    setStartingSession(false);
    if (data) {
      setActiveSessionId(data.id);
      setStartModalOpen(false);
    }
  }

  async function handleConfirmEnd() {
    if (!activeSessionId || endingSession) return;
    setEndingSession(true);
    const { error } = await endSession(activeSessionId);
    setEndingSession(false);
    if (!error) {
      setActiveSessionId(null);
      setEndModalOpen(false);
      // session-end trigger clears window-pane pins server-side;
      // bump the tick so the pane re-fetches and reverts to the
      // world banner.
      setRefreshTick((n) => n + 1);
    }
  }

  async function handleLeaveCampaign() {
    if (!campaign || !user || leaving) return;
    setLeaving(true);
    const { error } = await removeCampaignMember(campaign.id, user.id);
    setLeaving(false);
    if (!error) {
      removeCampaignFromStore(campaign.id);
      router.replace('/(drawer)/campaigns' as Href);
    }
  }

  async function handleDeleteCampaign() {
    if (!campaign || deleting) return;
    setDeleting(true);
    const { error } = await deleteCampaign(campaign.id);
    setDeleting(false);
    if (!error) {
      removeCampaignFromStore(campaign.id);
      router.replace('/(drawer)/campaigns' as Href);
    }
  }

  if (stillLoading || !campaign) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}
      contentContainerStyle={s.scrollContent}
    >
      {/* Leave-campaign confirmation banner — players only. Removing
          your own membership is destructive enough to warrant a
          two-step confirm rather than a popover. */}
      {leaveConfirmOpen ? (
        <View style={s.confirmBanner}>
          <Icon name="warning" size={18} color={colors.hpDanger} />
          <Text variant="body-sm" family="body" style={{ flex: 1, color: colors.onSurface }}>
            Leave <Text weight="bold">{campaign.name}</Text>? Your character stays on your account
            but you'll need a new join code to come back.
          </Text>
          <Pressable
            onPress={() => setLeaveConfirmOpen(false)}
            style={[s.bannerBtn, s.bannerCancel]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleLeaveCampaign}
            disabled={leaving}
            style={[s.bannerBtn, s.bannerDanger]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: '#fff', letterSpacing: 1 }}>
              {leaving ? 'Leaving…' : 'Leave'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {deleteConfirmOpen ? (
        <View style={s.confirmBanner}>
          <Icon name="warning" size={18} color={colors.hpDanger} />
          <Text variant="body-sm" family="body" style={{ flex: 1, color: colors.onSurface }}>
            Permanently delete <Text weight="bold">{campaign.name}</Text>? All sessions, members, and
            linked data will be removed. This cannot be undone.
          </Text>
          <Pressable
            onPress={() => setDeleteConfirmOpen(false)}
            style={[s.bannerBtn, s.bannerCancel]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDeleteCampaign}
            disabled={deleting}
            style={[s.bannerBtn, s.bannerDanger]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: '#fff', letterSpacing: 1 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ContentWidth size="wide" style={s.body}>
        {phase === 'setup' ? (
          <SetupChecklist
            isDM={isDM}
            systemDisplayName={
              campaign.system_label
                || BUNDLED_SYSTEMS_BY_ID[campaign.system]?.displayName
                || campaign.system
            }
            world={linkedWorld}
            packCount={packs.length}
            rulesSet={rulesSet}
            onConfigureRules={() => setRulesModalOpen(true)}
            onChooseWorld={() => setWorldModalOpen(true)}
            onManageContent={() => setContentModalOpen(true)}
          />
        ) : null}

        {phase !== 'setup' ? (
          <>
            {/* Window pane — always shown post-setup. Goes live in
                in-session mode; otherwise renders the world banner
                or a placeholder. */}
            <CampaignWindowPane
              campaignId={campaign.id}
              isDM={isDM}
              refreshTick={refreshTick}
            />

            {/* Player-only primary CTA (create or open character).
                DM session controls live in SessionControlCard below
                the party so the at-a-glance party view leads. */}
            {!isDM ? (
              <>
                <PrimaryAction
                  myMember={myMember}
                  campaignId={campaign.id}
                />
                {activeSessionId ? (
                  <Card tier="container" padding="md" style={{ gap: spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Icon name="edit-note" size={18} color={colors.hpHealthy} />
                      <Text variant="label-sm" weight="bold" uppercase style={{ color: colors.hpHealthy, letterSpacing: 1 }}>
                        Session in progress
                      </Text>
                    </View>
                    <GhostButton
                      label="My Notes"
                      icon="notes"
                      onPress={() => openNotes()}
                    />
                  </Card>
                ) : null}
              </>
            ) : null}

            <PartyPanel
              campaignId={campaign.id}
              members={members}
              characters={campaignCharacters}
              isDM={isDM}
              currentUserId={user?.id ?? null}
            />

            {isDM ? (
              <SessionControlCard
                campaignId={campaign.id}
                activeSessionId={activeSessionId}
                onStartSession={() => setStartModalOpen(true)}
                onEndSession={() => setEndModalOpen(true)}
                onNotes={() => openNotes()}
              />
            ) : null}

            {linkedWorld ? (
              <WorldCard world={linkedWorld} />
            ) : null}

            <ReferencesCard
              packs={packs}
              rulesSet={rulesSet}
              onConfigureRules={() => setRulesModalOpen(true)}
              onManageContent={() => setContentModalOpen(true)}
              coverImageUrl={campaign?.cover_image_url ?? null}
              isDM={isDM}
              coverUploading={coverUploading}
              onPickCover={handlePickCover}
            >
              <CampaignMembersCard
                campaignId={campaign.id}
                members={members}
                characters={campaignCharacters}
                currentUserId={user?.id ?? null}
                isDM={isDM}
                onManageMembers={() => setMembersModalOpen(true)}
                nested
              />
            </ReferencesCard>

            {/* Destructive actions — hosting them in their own card
                keeps the top of the page free of management chrome
                now that the tab row owns identity. DMs see Delete;
                players see Leave. */}
            {isDM ? (
              <ManageCampaignCard
                onDelete={() => setDeleteConfirmOpen(true)}
              />
            ) : (
              <ManageCampaignCard
                onLeave={() => setLeaveConfirmOpen(true)}
              />
            )}
          </>
        ) : null}
      </ContentWidth>

      {/* DM-only rules editor. Mounted at the page level so both
          the setup checklist and the references row can open it
          via the same callback. Wraps refreshTick++ on save so
          the page re-reads the bag and the gate flips. */}
      {isDM && rulesModalOpen ? (() => {
        const sys = BUNDLED_SYSTEMS_BY_ID[campaign.system];
        if (!sys) return null;
        return (
          <CharacterCreationRulesModal
            campaignId={campaign.id}
            system={sys}
            onClose={() => setRulesModalOpen(false)}
            onSaved={() => setRefreshTick((n) => n + 1)}
          />
        );
      })() : null}

      {/* DM-only world picker. Lets the DM either link an existing
          world or create + link a new one in a single round-trip.
          Refresh tick bump propagates to the linked-world reader so
          the checklist flips to ✓ on save. */}
      {isDM && worldModalOpen ? (
        <LinkWorldModal
          campaignId={campaign.id}
          currentWorld={linkedWorld}
          onClose={() => setWorldModalOpen(false)}
          onLinked={() => setRefreshTick((n) => n + 1)}
        />
      ) : null}

      {/* DM-only content manager — system swap + pack toggles in a
          single surface. Opened by the Game system / Content packs
          checklist rows and the references row's pack CTA. The
          modal owns its own visibility prop, so we always mount it
          (it no-ops while invisible) for cleaner state handling. */}
      {isDM ? (
        <ManageCampaignContentModal
          visible={contentModalOpen}
          campaignId={campaign.id}
          currentSystem={campaign.system}
          onClose={() => setContentModalOpen(false)}
          onChanged={() => setRefreshTick((n) => n + 1)}
        />
      ) : null}

      {/* DM-only members manager — join code + member list with
          per-row remove. Opened by the Party panel's CTA. We pass
          a setter to update the parent's campaign state when the
          DM regenerates the join code; member list is refreshed
          via refreshTick. */}
      {isDM && membersModalOpen ? (
        <ManageMembersModal
          campaignId={campaign.id}
          joinCode={campaign.join_code}
          members={members}
          currentUserId={user?.id ?? null}
          onClose={() => setMembersModalOpen(false)}
          onChanged={() => setRefreshTick((n) => n + 1)}
          onJoinCodeChanged={(code) =>
            setCampaign((prev) => (prev ? { ...prev, join_code: code } : prev))
          }
        />
      ) : null}


      {/* DM-only start/end session modals. Always mounted (visible
          flag controls render) so any in-flight state survives a
          stray remount. */}
      {isDM ? (
        <>
          <StartSessionModal
            visible={startModalOpen}
            players={startModalPlayers}
            starting={startingSession}
            onClose={() => setStartModalOpen(false)}
            onConfirm={handleConfirmStart}
          />
          <EndSessionModal
            visible={endModalOpen}
            ending={endingSession}
            onClose={() => setEndModalOpen(false)}
            onConfirm={handleConfirmEnd}
          />
        </>
      ) : null}

      {/* Web-only crop step for the campaign cover upload. Native
          uses the system crop UI baked into expo-image-picker. */}
      {coverCropUri ? (
        <ImageCropModal
          visible
          imageUri={coverCropUri}
          aspect={[16, 9]}
          usageHint="This image appears as the campaign's card cover and the fallback scene image when no scene is pinned."
          onConfirm={handleCoverCropConfirm}
          onCancel={() => setCoverCropUri(null)}
        />
      ) : null}
    </ScrollView>
  );
}


// ── Setup checklist ─────────────────────────────────────────────────

function SetupChecklist({
  isDM,
  systemDisplayName,
  world,
  packCount,
  rulesSet,
  onConfigureRules,
  onChooseWorld,
  onManageContent,
}: {
  isDM: boolean;
  /** Display name of the campaign's current system. Always set —
   *  campaigns are created with a default system that the DM can
   *  swap from the system row's CTA. */
  systemDisplayName: string;
  world: { id: string; name: string } | null;
  packCount: number;
  rulesSet: boolean;
  onConfigureRules: () => void;
  onChooseWorld: () => void;
  /** Opens the manage-content modal which handles both system swap
   *  and pack attach/enable. The same modal serves both checklist
   *  rows; we route through it so the DM doesn't get bounced
   *  between two surfaces. */
  onManageContent: () => void;
}) {
  if (!isDM) {
    return (
      <Card tier="container" padding="md">
        <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
          The DM is still setting up
        </Text>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 6 }}>
          Once the DM has linked a world and configured character creation rules, you'll be able to
          create your character and join the campaign.
        </Text>
      </Card>
    );
  }
  return (
    <Card tier="container" padding="md" style={{ gap: spacing.md }}>
      <View>
        <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
          Set up the campaign
        </Text>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
          Finish these steps before inviting players.
        </Text>
      </View>

      {/* System row is always "done" — campaigns are created with a
          default system. The DM swaps via the manage-content modal,
          which gates the swap once any character exists on the
          campaign. The check is intrinsic state, not a gate the DM
          has to pass; it's a confirmation breadcrumb. */}
      <ChecklistItem
        done
        title="Game system"
        body={`Using ${systemDisplayName}. Swap before any characters are created.`}
        cta="Change system"
        onPress={onManageContent}
      />
      <ChecklistItem
        done={!!world}
        title="Link a world"
        body={world ? `Linked to ${world.name}.` : 'Pick or create the world this campaign is set in.'}
        cta={world ? 'Manage' : 'Choose world'}
        onPress={onChooseWorld}
      />
      <ChecklistItem
        done={packCount > 0}
        optional
        title="Attach content packs"
        body={
          packCount > 0
            ? `${packCount} pack${packCount === 1 ? '' : 's'} attached.`
            : 'Optional — SRD content is always available without a pack.'
        }
        cta={packCount > 0 ? 'Manage packs' : 'Add packs'}
        onPress={onManageContent}
      />
      <ChecklistItem
        done={rulesSet}
        title="Set character creation rules"
        body={
          rulesSet
            ? 'Saved — players will use these settings during character creation.'
            : 'Decide starting level, ability score method, multiclassing, and other knobs.'
        }
        cta={rulesSet ? 'Edit rules' : 'Configure'}
        onPress={onConfigureRules}
      />
    </Card>
  );
}

function ChecklistItem({
  done, optional, title, body, cta, onPress,
}: {
  done: boolean;
  optional?: boolean;
  title: string;
  body: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <View style={s.checklistRow}>
      <View style={[s.checklistIcon, done && s.checklistIconDone]}>
        <Icon
          name={done ? 'check' : 'radio-button-unchecked'}
          size={16}
          color={done ? colors.onPrimary : colors.outline}
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
          <Text variant="body-md" family="body" weight="semibold" style={{ color: colors.onSurface }}>
            {title}
          </Text>
          {optional ? <MetaLabel size="sm">Optional</MetaLabel> : null}
        </View>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
          {body}
        </Text>
      </View>
      <GhostButton label={cta} onPress={onPress} />
    </View>
  );
}

// ── Primary action (role-specific) ──────────────────────────────────

// Player-only primary CTA — renders the "Create your character" card
// only when no character is linked yet. Once a character is set, the
// CTA disappears entirely: the Party panel below already surfaces the
// player's own row as a tappable card that opens the sheet, so a
// dedicated "Your character" snapshot above duplicated that
// affordance.
function PrimaryAction({
  myMember,
  campaignId,
}: {
  myMember: Member | undefined;
  campaignId: string;
}) {
  const router = useRouter();

  if (myMember?.character_id) return null;

  return (
    <Card tier="container" padding="md" style={s.primaryActionCard}>
      <View style={{ flex: 1 }}>
        <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
          Create your character
        </Text>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
          Build a character using the campaign's allowed sources and rules.
        </Text>
      </View>
      <GradientButton
        label="Create character"
        onPress={() => router.push(`/campaign/${campaignId}/pick-character` as Href)}
      />
    </Card>
  );
}

// ── Party ───────────────────────────────────────────────────────────

function PartyPanel({
  campaignId,
  members,
  characters,
  isDM,
  currentUserId,
}: {
  campaignId: string;
  members: Member[];
  /** Full campaign roster — every character whose campaign_id points
   *  here. PartyPanel renders one card per character (not per member),
   *  so a player with two characters in the campaign shows two cards.
   *  Inactive characters (settings.active === false) are filtered. */
  characters: CampaignCharacter[];
  isDM: boolean;
  currentUserId: string | null;
}) {
  // Pull a name lookup off the membership join so each card can show
  // the player's display name without a second query. DM-owned
  // characters are included — Party = "active characters on the
  // field," and the role distinction lives in the Members card chip.
  const nameByUser = new Map<string, string>();
  for (const m of members) {
    nameByUser.set(m.user_id, m.profiles?.display_name ?? 'Unknown');
  }

  // Active characters only. `settings.active !== false` keeps
  // pre-flag characters (where the field is absent) visible by default.
  const activeChars = characters.filter((c) => {
    const stats = c.base_stats as Dnd5eStats | null;
    const settings = stats?.settings as CharacterSettings | undefined;
    return settings?.active !== false;
  });

  // Player members with no character yet — surfaced as fallback rows
  // so the DM can still see them in the roster. DMs always have a
  // character (or are expected to manage NPCs separately), so we
  // continue to filter them out of the empty-slot list.
  const playersWithNoChar = members.filter((m) =>
    m.role !== 'gm' && !characters.some((c) => c.user_id === m.user_id)
  );

  return (
    <Card tier="container" padding="md" style={{ gap: spacing.sm }}>
      <MetaLabel size="sm">Party</MetaLabel>
      {activeChars.length === 0 && playersWithNoChar.length === 0 ? (
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant }}>
          {isDM
            ? 'No players yet. Open Manage members for the join code.'
            : 'No other players yet.'}
        </Text>
      ) : (
        // Responsive 2-up grid of detailed PartyMemberCards — one per
        // active character. Players without a linked character render
        // as a sparse fallback row at the end.
        <View style={s.partyGrid}>
          {activeChars.map((c) => (
            <View key={c.id} style={s.partyGridCell}>
              <PartyMemberCard
                playerName={nameByUser.get(c.user_id) ?? 'Unknown'}
                character={c}
                campaignId={campaignId}
                canOpen={isDM || c.user_id === currentUserId}
              />
            </View>
          ))}
          {playersWithNoChar.map((m) => {
            const isYou = m.user_id === currentUserId;
            return (
              <View key={m.user_id} style={[s.partyRow, s.partyRowEmpty]}>
                <View style={s.partyAvatar}>
                  <Text variant="label-md" family="body" weight="bold" style={{ color: colors.onPrimary }}>
                    {(m.profiles?.display_name ?? '?').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body-sm" family="body" weight="semibold" style={{ color: colors.onSurface }}>
                    {m.profiles?.display_name ?? 'Unknown'}
                    {isYou ? (
                      <Text variant="body-sm" style={{ color: colors.outline }}>{' '}(you)</Text>
                    ) : null}
                  </Text>
                  <Text variant="label-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 1 }}>
                    No character yet
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

// ── Session control ─────────────────────────────────────────────────

/**
 * DM-only card that combines the start/end session primary action with
 * the session notes & recaps link. Renders below the party panel so
 * the at-a-glance party view leads the page. Two visual states:
 *   • Idle  — "Start your next session" headline + Start session
 *             gradient button + Notes ghost button.
 *   • Live  — "Session in progress" eyebrow + Combat tracker / End
 *             session / Notes ghost buttons.
 */
function SessionControlCard({
  campaignId,
  activeSessionId,
  onStartSession,
  onEndSession,
  onNotes,
}: {
  campaignId: string;
  activeSessionId: string | null;
  onStartSession: () => void;
  onEndSession: () => void;
  onNotes: () => void;
}) {
  const router = useRouter();
  const isLive = !!activeSessionId;
  return (
    <Card tier="container" padding="md" style={s.primaryActionCard}>
      <View style={{ flex: 1 }}>
        {isLive ? (
          <>
            <Text variant="label-sm" weight="bold" uppercase style={{ color: colors.hpHealthy, letterSpacing: 1 }}>
              Session in progress
            </Text>
            <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
              Pinned imagery shows in the window pane above. Open the combat tracker, jump to notes, or wrap up below.
            </Text>
          </>
        ) : (
          <>
            <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
              Start your next session
            </Text>
            <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
              Kick off a session to enable the live window pane and combat tracker — or jump straight to your session notes.
            </Text>
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
        <GhostButton
          label="Encounters"
          icon="shield"
          onPress={() => router.push(`/campaign/${campaignId}/encounters` as Href)}
        />
        {isLive ? (
          <>
            <GhostButton
              label="Notes"
              icon="notes"
              onPress={onNotes}
            />
            <GhostButton
              label="End session"
              icon="stop"
              onPress={onEndSession}
            />
          </>
        ) : (
          <>
            <GhostButton
              label="Notes"
              icon="notes"
              onPress={() => router.push(`/campaign/${campaignId}/notes` as Href)}
            />
            <GradientButton
              label="Start session"
              onPress={onStartSession}
            />
          </>
        )}
      </View>
    </Card>
  );
}

// ── World shortcut ──────────────────────────────────────────────────

function WorldCard({ world }: { world: { id: string; name: string } }) {
  const openSplit = useSplitPaneStore((st) => st.openSplit);
  return (
    <Card tier="container" padding="md">
      <Pressable
        onPress={() => openSplit({ kind: 'world-home', worldId: world.id })}
        style={s.worldCardRow}
        accessibilityRole="button"
        accessibilityLabel={`Open world: ${world.name}`}
      >
        <Icon name="public" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <MetaLabel size="sm">World</MetaLabel>
          <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
            {world.name}
          </Text>
        </View>
        <Icon name="open-in-new" size={18} color={colors.onSurfaceVariant} />
      </Pressable>
    </Card>
  );
}

// ── References ──────────────────────────────────────────────────────

function ReferencesCard({
  packs,
  rulesSet,
  onConfigureRules,
  onManageContent,
  coverImageUrl,
  isDM,
  coverUploading,
  onPickCover,
  children,
}: {
  packs: HomebrewPackRow[];
  rulesSet: boolean;
  onConfigureRules: () => void;
  onManageContent: () => void;
  /** Current cover image url (null when none uploaded yet). */
  coverImageUrl: string | null;
  /** Only DMs can edit the cover. Non-DMs see the cover if one's
   *  set, but no edit affordance. */
  isDM: boolean;
  /** True while an upload is in flight — shows a spinner overlay. */
  coverUploading: boolean;
  /** Opens the platform image picker. */
  onPickCover: () => void;
  /** Optional follow-up content rendered inside the same card after
   *  the reference rows. Used to nest the Members section. */
  children?: React.ReactNode;
}) {
  // Collapsed by default — this card aggregates references + roster,
  // which is supporting info that doesn't need to push the at-a-glance
  // party + session controls down the page. State is per-mount; expand
  // is a single click away when the DM needs to manage world/packs/etc.
  const [expanded, setExpanded] = useState(false);
  return (
    <Card tier="container" padding="md" style={{ gap: expanded ? spacing.md : 0 }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={s.aboutHeader}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse About this Campaign' : 'Expand About this Campaign'}
      >
        <MetaLabel size="sm">About this Campaign</MetaLabel>
        <Icon
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.onSurfaceVariant}
        />
      </Pressable>
      {expanded ? (
        <>
          <View style={{ gap: spacing.sm }}>
            <View style={s.referencesGrid}>
              <ReferenceRow
                label="Content packs"
                value={packs.length > 0
                  ? `${packs.length} attached`
                  : 'SRD only'}
                ctaIcon="folder-open"
                onPress={onManageContent}
              />
              <ReferenceRow
                label="Character rules"
                value={rulesSet ? 'Configured' : 'Not set'}
                ctaIcon="tune"
                onPress={onConfigureRules}
              />
              {isDM ? (
                <ReferenceRow
                  label="Campaign cover"
                  value={
                    coverUploading
                      ? 'Uploading…'
                      : coverImageUrl
                        ? 'Edit image'
                        : 'Add image'
                  }
                  ctaIcon="image"
                  onPress={coverUploading ? undefined : onPickCover}
                />
              ) : null}
            </View>
          </View>
          {children}
        </>
      ) : null}
    </Card>
  );
}

// ── Manage campaign ──────────────────────────────────────────────────

/**
 * Destructive-actions card hosted at the bottom of the campaign page.
 * Renders either Delete (DM) or Leave (player). Splitting these into
 * their own card lets the top of the page stay clean now that
 * identity lives in the route's tab row.
 */
function ManageCampaignCard({
  onDelete, onLeave,
}: {
  onDelete?: () => void;
  onLeave?: () => void;
}) {
  return (
    <Card tier="container" padding="md" style={{ gap: spacing.sm }}>
      <MetaLabel size="sm">Manage Campaign</MetaLabel>
      <View style={s.manageActionRow}>
        {onDelete ? (
          <GhostButton
            label="Delete campaign"
            icon="delete-outline"
            onPress={onDelete}
          />
        ) : null}
        {onLeave ? (
          <GhostButton
            label="Leave campaign"
            icon="logout"
            onPress={onLeave}
          />
        ) : null}
      </View>
    </Card>
  );
}

function ReferenceRow({
  label, value, ctaIcon, onPress,
}: {
  label: string;
  value: string;
  ctaIcon: React.ComponentProps<typeof Icon>['name'];
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        s.referenceRow,
        pressed && onPress ? { opacity: 0.85 } : null,
      ]}
    >
      <View style={{ flex: 1 }}>
        <MetaLabel size="sm">{label}</MetaLabel>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurface, marginTop: 2 }}>
          {value}
        </Text>
      </View>
      {onPress ? <Icon name={ctaIcon} size={16} color={colors.outline} /> : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  scrollContent: { paddingBottom: spacing.xl },
  loadingContainer: {
    flex: 1, backgroundColor: colors.surfaceCanvas,
    justifyContent: 'center', alignItems: 'center',
  },
  body: { padding: spacing.lg, gap: spacing.md },


  /** Two-step confirmation banner. Destructive intent reads as a
   *  clear, full-width call to action rather than a tooltip. */
  confirmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hpDanger + '44',
  },
  bannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  bannerCancel: {
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '88',
  },
  bannerDanger: {
    backgroundColor: colors.hpDanger,
  },


  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checklistIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '88',
  },
  checklistIconDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  primaryActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },

  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  partyRowEmpty: {
    // Fallback row for members without a linked character — keeps them
    // visible in the roster but without the full-card chrome.
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    width: '100%',
  },
  partyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Responsive grid for the PartyMemberCard layout. flexWrap + percent
  // basis gives us 1 column on narrow viewports and 2 columns from
  // ~640px up; on a wide desktop the parent Card constrains the inner
  // grid to a comfortable max width anyway.
  partyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  partyGridCell: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 280,
  },

  worldCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  referencesGrid: { gap: spacing.xs },
  /** Pressable header row for the collapsible About-this-Campaign card.
   *  Lays the eyebrow label and the expand chevron on the same line so
   *  the whole row is one tap target. */
  aboutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  /** Layout for the Manage Campaign action buttons. flex-start so a
   *  single-button variant doesn't stretch. */
  manageActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  referenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
});
