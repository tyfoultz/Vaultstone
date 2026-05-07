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
  getActiveSession, getSessionParticipants,
  getWorldsForCampaign,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import {
  colors, spacing, radius,
  Card, GhostButton, GradientButton, Icon, MetaLabel, ScreenHeader, Text,
} from '@vaultstone/ui';
import type { Database, Dnd5eStats } from '@vaultstone/types';
import { CampaignWindowPane } from './CampaignWindowPane';

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
  const [loadingFlags, setLoadingFlags] = useState({ campaign: true, world: true, members: true });
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
  // Setup is complete when: world linked, character-creation rules
  // set. Packs are optional. Until the rules feature ships, treat
  // "rules set" as always true so packed-but-no-rules campaigns
  // don't get stuck in Setup forever.
  const charRulesSet = true; // TODO: wire when char-creation rules land
  const setupComplete = !!linkedWorld && charRulesSet;
  const phase: Phase = !setupComplete ? 'setup'
    : activeSessionId ? 'in-session'
    : 'open';

  const stillLoading = loadingFlags.campaign || loadingFlags.world || loadingFlags.members;

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

      <View style={s.body}>
        <HeroStrip campaign={campaign} world={linkedWorld} />

        {phase === 'setup' ? (
          <SetupChecklist
            isDM={isDM}
            world={linkedWorld}
            packCount={packs.length}
            charRulesSet={charRulesSet}
            campaignId={campaign.id}
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
              onSessionChanged={() => setRefreshTick((n) => n + 1)}
            />

            <PartyPanel
              members={members}
              isDM={isDM}
              currentUserId={user?.id ?? null}
            />

            <RecentActivityCard campaignId={campaign.id} />

            <ReferencesCard
              world={linkedWorld}
              packs={packs}
            />
          </>
        ) : null}
      </View>
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
  world,
  packCount,
  charRulesSet,
  campaignId,
}: {
  isDM: boolean;
  world: { id: string; name: string } | null;
  packCount: number;
  charRulesSet: boolean;
  campaignId: string;
}) {
  const router = useRouter();
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

      <ChecklistItem
        done={!!world}
        title="Link a world"
        body={world ? `Linked to ${world.name}.` : 'Pick or create the world this campaign is set in.'}
        cta={world ? 'Manage' : 'Choose world'}
        onPress={() => router.push('/(drawer)/worlds' as Href)}
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
        onPress={() => router.push(`/campaign/${campaignId}` as Href)}
      />
      <ChecklistItem
        done={charRulesSet}
        title="Set character creation rules"
        body={
          charRulesSet
            ? 'Defaults applied. You can edit anytime.'
            : 'Decide starting level, ability score method, allowed sources.'
        }
        cta={charRulesSet ? 'Edit rules' : 'Configure'}
        onPress={() => {
          // TODO: route to character-rules editor when that lands
        }}
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
  onSessionChanged,
}: {
  isDM: boolean;
  activeSessionId: string | null;
  myMember: Member | undefined;
  campaignId: string;
  onSessionChanged: () => void;
}) {
  const router = useRouter();

  // DM in-session: end-session button (handled by the existing modal
  // path on V1; v2 routes them to the V1 page for now to avoid
  // duplicating the modal during the redesign).
  if (isDM) {
    if (activeSessionId) {
      return (
        <Card tier="container" padding="md" style={s.primaryActionCard}>
          <View style={{ flex: 1 }}>
            <Text variant="label-sm" weight="bold" uppercase style={{ color: colors.hpHealthy, letterSpacing: 1 }}>
              Session in progress
            </Text>
            <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
              Pinned imagery shows in the window pane above. End the session from the V1 page.
            </Text>
          </View>
          <GhostButton
            label="Open session view"
            icon="open-in-new"
            onPress={() => router.push(`/campaign/${campaignId}/combat` as Href)}
          />
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
          onPress={() => router.push(`/campaign/${campaignId}` as Href)}
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
}: {
  members: Member[];
  isDM: boolean;
  currentUserId: string | null;
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
          // V1 "manage members" lives in a modal on the old page —
          // for now, link there so the redesign doesn't duplicate
          // the modal logic before it stabilizes.
          <MetaLabel size="sm">Manage from V1 page</MetaLabel>
        ) : null}
      </View>
      {players.length === 0 ? (
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant }}>
          No players yet. Share the join code from the V1 page to invite some.
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
}: {
  world: { id: string; name: string } | null;
  packs: HomebrewPackRow[];
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
          onPress={() => {
            // V1 hosts CampaignPacksCard; until V2 has its own,
            // surface the list inline on the V1 page.
          }}
        />
        <ReferenceRow
          label="Character rules"
          value="Defaults"
          ctaIcon="tune"
          onPress={() => {
            // TODO: routes to character rules editor when that lands
          }}
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
