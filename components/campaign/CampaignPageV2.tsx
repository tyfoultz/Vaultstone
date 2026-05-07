// Campaign page V2 — landing/decision hub for one campaign.
//
// Replaces the V1 dashboard's wall of cards with a phase-aware layout:
//   • Setup mode  — DM-only checklist (world / packs / character rules)
//                   gated until everything is set.
//   • Open mode   — steady-state hub. DM sees session controls + party
//                   + recent activity + references; player sees their
//                   character, party, and activity.
//   • In-session  — same layout, but the window pane goes live above
//                   the rest and Start Session swaps to End Session.
//
// Side-by-side: V1 stays at /campaign/[id]; this component renders
// when the route receives `?v=2`. Swap V1 for this once happy.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, ScrollView, StyleSheet, Pressable, Image, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect, type Href } from 'expo-router';
import {
  supabase, getCampaignMembers, listCampaignPacks,
  getActiveSession, startSession, endSession,
  getWorldsForCampaign,
  getCampaignCharacterRules,
  resolveRuleValues,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { BUNDLED_SYSTEMS_BY_ID } from '@vaultstone/systems';
import { CharacterCreationRulesModal } from './CharacterCreationRulesModal';
import { useAuthStore } from '@vaultstone/store';
import {
  colors, spacing, radius,
  Card, ContentWidth, GhostButton, GradientButton, Icon, MetaLabel, ScreenHeader, Text,
} from '@vaultstone/ui';
import type { Database, Dnd5eStats } from '@vaultstone/types';
import { CampaignWindowPane } from './CampaignWindowPane';
import { LinkWorldModal } from './LinkWorldModal';
import { ManageCampaignContentModal } from './ManageCampaignContentModal';
import { ManageMembersModal } from './ManageMembersModal';
import { StartSessionModal, type StartSessionPlayer } from '../session/StartSessionModal';
import { EndSessionModal } from '../session/EndSessionModal';

type Campaign = Database['public']['Tables']['campaigns']['Row'];
type Member = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  joined_at: string;
  profiles: { id: string; display_name: string | null } | null;
  characters: { id: string; name: string; system: string; base_stats: unknown } | null;
};

type Phase = 'setup' | 'open' | 'in-session';

type Props = {
  campaignId: string;
};

export function CampaignPageV2({ campaignId }: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
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
   *  attach/enable in a single surface (mirrors V1's flow). Opened
   *  by the System and Content packs checklist rows + the
   *  references row's pack CTA. */
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
  const [loadingFlags, setLoadingFlags] = useState({ campaign: true, world: true, members: true, rules: true });
  // Bumped to refresh derived surfaces (window pane, party list) after
  // a write that affects them (e.g. clear scene, add member).
  const [refreshTick, setRefreshTick] = useState(0);

  const isDM = !!campaign && campaign.dm_user_id === user?.id;
  const myMember = members.find((m) => m.user_id === user?.id);

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
      <ScreenHeader
        title={campaign.name}
        subtitle={phaseLabel(phase, isDM)}
        actions={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <GhostButton
              label="Back"
              icon="arrow-back"
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(drawer)/campaigns' as Href);
              }}
            />
            {/* V2 is opt-in via ?v=2 while we test parity. Provide a
                jump back to V1 for any feature V2 hasn't ported yet. */}
            <GhostButton
              label="V1 layout"
              onPress={() => router.replace(`/campaign/${campaignId}` as Href)}
            />
          </View>
        }
      />

      <ContentWidth size="wide" style={s.body}>
        <HeroStrip campaign={campaign} world={linkedWorld} />

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

            <PrimaryAction
              isDM={isDM}
              activeSessionId={activeSessionId}
              myMember={myMember}
              campaignId={campaign.id}
              onStartSession={() => setStartModalOpen(true)}
              onEndSession={() => setEndModalOpen(true)}
            />

            <PartyPanel
              members={members}
              isDM={isDM}
              currentUserId={user?.id ?? null}
              onManageMembers={() => setMembersModalOpen(true)}
            />

            <RecentActivityCard campaignId={campaign.id} />

            <ReferencesCard
              world={linkedWorld}
              packs={packs}
              rulesSet={rulesSet}
              onConfigureRules={() => setRulesModalOpen(true)}
              onManageContent={() => setContentModalOpen(true)}
            />
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
    </ScrollView>
  );
}

function phaseLabel(phase: Phase, isDM: boolean): string {
  if (phase === 'setup') return isDM ? 'Setup — finish to invite players' : 'Waiting for the DM';
  if (phase === 'in-session') return 'Session in progress';
  return 'Open campaign';
}

// ── Hero ────────────────────────────────────────────────────────────

function HeroStrip({
  campaign,
  world,
}: {
  campaign: Campaign;
  world: { id: string; name: string } | null;
}) {
  return (
    <Card tier="container" padding="md" style={s.heroCard}>
      {campaign.cover_image_url ? (
        <Image source={{ uri: campaign.cover_image_url }} style={s.heroCover} />
      ) : (
        <View style={[s.heroCover, s.heroCoverPlaceholder]}>
          <Icon name="image" size={28} color={colors.outline} />
        </View>
      )}
      <View style={s.heroBody}>
        <Text variant="title-lg" family="headline" weight="bold" style={{ color: colors.onSurface }}>
          {campaign.name}
        </Text>
        <View style={s.heroMetaRow}>
          <MetaLabel size="sm">{campaign.system_label || campaign.system}</MetaLabel>
          {world ? (
            <>
              <Text variant="label-sm" style={{ color: colors.outline }}>·</Text>
              <MetaLabel size="sm">{world.name}</MetaLabel>
            </>
          ) : null}
        </View>
        {campaign.description ? (
          <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 6 }}>
            {campaign.description}
          </Text>
        ) : null}
      </View>
    </Card>
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

function PrimaryAction({
  isDM,
  activeSessionId,
  myMember,
  campaignId,
  onStartSession,
  onEndSession,
}: {
  isDM: boolean;
  activeSessionId: string | null;
  myMember: Member | undefined;
  campaignId: string;
  /** Open the start-session modal (DM picks which players are
   *  present, then session row gets created). */
  onStartSession: () => void;
  /** Open the end-session confirmation modal. */
  onEndSession: () => void;
}) {
  const router = useRouter();

  if (isDM) {
    if (activeSessionId) {
      return (
        <Card tier="container" padding="md" style={s.primaryActionCard}>
          <View style={{ flex: 1 }}>
            <Text variant="label-sm" weight="bold" uppercase style={{ color: colors.hpHealthy, letterSpacing: 1 }}>
              Session in progress
            </Text>
            <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
              Pinned imagery shows in the window pane above. Open the combat tracker or wrap up below.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
            <GhostButton
              label="Combat tracker"
              icon="open-in-new"
              onPress={() => router.push(`/campaign/${campaignId}/combat` as Href)}
            />
            <GhostButton
              label="End session"
              icon="stop"
              onPress={onEndSession}
            />
          </View>
        </Card>
      );
    }
    return (
      <Card tier="container" padding="md" style={s.primaryActionCard}>
        <View style={{ flex: 1 }}>
          <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
            Start your next session
          </Text>
          <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
            Kick off a session to enable the live window pane and combat tracker.
          </Text>
        </View>
        <GradientButton
          label="Start session"
          onPress={onStartSession}
        />
      </Card>
    );
  }

  // Player without a character — primary CTA is "create your
  // character" routing to the campaign-aware wizard.
  if (!myMember?.character_id) {
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

  // Player with a character — surface a quick character snapshot.
  const stats = myMember.characters?.base_stats as Dnd5eStats | null;
  const className = stats?.classKey
    ? stats.classKey.charAt(0).toUpperCase() + stats.classKey.slice(1)
    : '';
  const level = stats?.level ?? 1;
  return (
    <Card tier="container" padding="md" style={s.primaryActionCard}>
      <View style={{ flex: 1 }}>
        <MetaLabel size="sm">Your character</MetaLabel>
        <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface, marginTop: 2 }}>
          {myMember.characters?.name ?? 'Unnamed'}
        </Text>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
          {className ? `${className} · Level ${level}` : `Level ${level}`}
        </Text>
      </View>
      <GhostButton
        label="Open sheet"
        icon="open-in-new"
        onPress={() => myMember.character_id && router.push(`/character/${myMember.character_id}` as Href)}
      />
    </Card>
  );
}

// ── Party ───────────────────────────────────────────────────────────

function PartyPanel({
  members,
  isDM,
  currentUserId,
  onManageMembers,
}: {
  members: Member[];
  isDM: boolean;
  currentUserId: string | null;
  onManageMembers: () => void;
}) {
  const players = members.filter((m) => m.role !== 'gm');
  return (
    <Card tier="container" padding="md" style={{ gap: spacing.sm }}>
      <View style={s.cardHeadRow}>
        <View>
          <MetaLabel size="sm">Party</MetaLabel>
          <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface, marginTop: 2 }}>
            {players.length} {players.length === 1 ? 'player' : 'players'}
          </Text>
        </View>
        {isDM ? (
          <GhostButton
            label="Manage members"
            icon="group"
            onPress={onManageMembers}
          />
        ) : null}
      </View>
      {players.length === 0 ? (
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant }}>
          {isDM
            ? 'No players yet. Open Manage members for the join code.'
            : 'No other players yet.'}
        </Text>
      ) : (
        <View style={{ gap: 6 }}>
          {players.map((m) => {
            const stats = m.characters?.base_stats as Dnd5eStats | null;
            const cls = stats?.classKey
              ? stats.classKey.charAt(0).toUpperCase() + stats.classKey.slice(1)
              : null;
            const level = stats?.level ?? null;
            const subtitle = m.characters
              ? `${m.characters.name}${cls ? ` · ${cls}${level ? ` ${level}` : ''}` : ''}`
              : 'No character yet';
            return (
              <View key={m.user_id} style={s.partyRow}>
                <View style={s.partyAvatar}>
                  <Text variant="label-md" family="body" weight="bold" style={{ color: colors.onPrimary }}>
                    {(m.profiles?.display_name ?? '?').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body-sm" family="body" weight="semibold" style={{ color: colors.onSurface }}>
                    {m.profiles?.display_name ?? 'Unknown'}
                    {m.user_id === currentUserId ? (
                      <Text variant="body-sm" style={{ color: colors.outline }}>{' '}(you)</Text>
                    ) : null}
                  </Text>
                  <Text variant="label-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 1 }}>
                    {subtitle}
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

// ── Recent activity ─────────────────────────────────────────────────

function RecentActivityCard({ campaignId }: { campaignId: string }) {
  // Placeholder for v2: the V1 page mounts SessionLogCard +
  // SessionHistoryCard + SessionNotesPanel as separate cards. For the
  // redesign, surface a single "recent activity" preview that links
  // into the existing notes/recap routes. Full embed comes when the
  // V1 cards are decommissioned.
  const router = useRouter();
  return (
    <Card tier="container" padding="md" style={{ gap: spacing.sm }}>
      <View style={s.cardHeadRow}>
        <View>
          <MetaLabel size="sm">Recent activity</MetaLabel>
          <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface, marginTop: 2 }}>
            Session notes & recaps
          </Text>
        </View>
        <GhostButton
          label="Notes"
          icon="notes"
          onPress={() => router.push(`/campaign/${campaignId}/notes` as Href)}
        />
      </View>
      <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant }}>
        Embed of the most recent session recap + last note timestamp lands when V1 cards are
        decommissioned. For now, jump to the notes page above.
      </Text>
    </Card>
  );
}

// ── References ──────────────────────────────────────────────────────

function ReferencesCard({
  world,
  packs,
  rulesSet,
  onConfigureRules,
  onManageContent,
}: {
  world: { id: string; name: string } | null;
  packs: HomebrewPackRow[];
  rulesSet: boolean;
  onConfigureRules: () => void;
  onManageContent: () => void;
}) {
  const router = useRouter();
  return (
    <Card tier="container" padding="md" style={{ gap: spacing.sm }}>
      <MetaLabel size="sm">References</MetaLabel>
      <View style={s.referencesGrid}>
        <ReferenceRow
          label="World"
          value={world?.name ?? '—'}
          ctaIcon="open-in-new"
          onPress={world ? () => router.push(`/world/${world.id}` as Href) : undefined}
        />
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

  heroCard: { padding: 0, overflow: 'hidden' },
  heroCover: { width: '100%', aspectRatio: 16 / 9 },
  heroCoverPlaceholder: {
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  heroBody: {
    padding: spacing.md,
    gap: 4,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: 4,
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
  partyAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  referencesGrid: { gap: spacing.xs },
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
