import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getActiveSession,
  getCampaignMembers,
  getCompletedSessionCount,
  getPage,
  startSession,
} from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import {
  selectSectionsForWorld,
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import { Chip, GhostButton, GradientButton, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';
import type { Database, TimelineCalendarSchema, WorldSection } from '@vaultstone/types';

import { useActiveSection } from '../../../components/world/ActiveSectionContext';
import { CreatePageModal } from '../../../components/world/CreatePageModal';
import { CreateSectionModal } from '../../../components/world/CreateSectionModal';
import { WorldOpeningBlock } from '../../../components/world/WorldOpeningBlock';
import {
  WorldSectionAddCard,
  WorldSectionCard,
} from '../../../components/world/WorldSectionCard';
import { WorldTopBar } from '../../../components/world/WorldTopBar';
import { worldPageHref, worldSectionHref } from '../../../components/world/worldHref';
import { StartSessionModal, type StartSessionPlayer } from '../../../components/session/StartSessionModal';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

type PartyMember = {
  userId: string;
  displayName: string;
  characterName: string | null;
  species: string | null;
  className: string | null;
  level: number;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  initials: string;
};

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Srd /, '');
}

function computeAC(stats: Record<string, unknown>, resources: Record<string, unknown> | null): number {
  const scores = stats?.abilityScores as Record<string, number> | undefined;
  if (!scores) return 10;
  const dexMod = Math.floor((scores.dexterity - 10) / 2);
  const equipment = (resources?.equipment ?? []) as Array<{
    slot: string; equipped: boolean; acBase?: number; acBonus?: number; dexCap?: number | null;
  }>;
  const armor = equipment.find((e) => e.slot === 'armor' && e.equipped);
  const shield = equipment.find((e) => e.slot === 'shield' && e.equipped);
  let base = 10 + dexMod;
  if (armor) {
    const dexBonus = armor.dexCap != null ? Math.min(dexMod, armor.dexCap) : dexMod;
    base = (armor.acBase ?? 10) + dexBonus;
  }
  if (shield) base += shield.acBonus ?? 2;
  return base;
}

// CSS grid lives inline; see note in SectionPageGrid.tsx.
const ATLAS_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
  gap: spacing.md,
} as const;

export default function WorldLandingScreen() {
  const { worldId } = useLocalSearchParams<{ worldId: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const pagesByWorld = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const { setActiveSectionId } = useActiveSection();
  const linkedCampaigns = useCurrentWorldStore((s) => s.linkedCampaigns);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [createPageSectionId, setCreatePageSectionId] = useState<string | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [calendarSchema, setCalendarSchema] = useState<TimelineCalendarSchema | null>(null);
  const [activeSessionCampaignId, setActiveSessionCampaignId] = useState<string | null>(null);
  const [startModalCampaign, setStartModalCampaign] = useState<Campaign | null>(null);
  const [sessionPlayers, setSessionPlayers] = useState<StartSessionPlayer[]>([]);
  const [startingSession, setStartingSession] = useState(false);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);
  const [prepPage, setPrepPage] = useState<{
    id: string; title: string; bodyText: string | null; bodyRefs: string[];
  } | null>(null);

  const isOwner = !!(user && world && user.id === world.owner_user_id);

  useEffect(() => {
    if (linkedCampaigns.length === 0) return;
    Promise.all(linkedCampaigns.map((c) => getCompletedSessionCount(c.id))).then(
      (results) => setTotalSessions(results.reduce((sum, r) => sum + r.count, 0)),
    );
    Promise.all(linkedCampaigns.map((c) => getActiveSession(c.id))).then((results) => {
      const active = results.find((r) => r.data);
      if (active?.data) {
        const session = active.data as { id: string; campaign_id: string };
        setActiveSessionCampaignId(session.campaign_id);
      }
    });
    Promise.all(linkedCampaigns.map((c) => getCampaignMembers(c.id))).then((results) => {
      const members: PartyMember[] = [];
      const seen = new Set<string>();
      for (const { data } of results) {
        if (!data) continue;
        for (const raw of data as unknown as Array<{
          user_id: string;
          role: string;
          profiles: { display_name: string | null } | null;
          characters: { id: string; name: string; system: string; base_stats: unknown; resources: unknown } | null;
        }>) {
          if (raw.role !== 'player' || !raw.characters || seen.has(raw.user_id)) continue;
          seen.add(raw.user_id);
          const stats = raw.characters.base_stats as Record<string, unknown> | null;
          const res = raw.characters.resources as Record<string, unknown> | null;
          const name = raw.characters.name;
          const initials = name.split(/\s+/).map((w) => w[0]?.toUpperCase()).join('').slice(0, 2);
          const level = (stats?.level as number) ?? 1;
          const hpMax = (stats?.hpMax as number) ?? 0;
          const hpCurrent = (res?.hpCurrent as number) ?? hpMax;
          const speciesKey = stats?.speciesKey as string | undefined;
          const classKey = stats?.classKey as string | undefined;
          members.push({
            userId: raw.user_id,
            displayName: raw.profiles?.display_name ?? 'Anonymous',
            characterName: name,
            species: speciesKey ? formatKey(speciesKey) : null,
            className: classKey ? formatKey(classKey) : null,
            level,
            hpCurrent,
            hpMax,
            ac: computeAC(stats ?? {}, res),
            initials,
          });
        }
      }
      setPartyMembers(members);
    });
  }, [linkedCampaigns]);

  useEffect(() => {
    if (!world?.primary_timeline_page_id) return;
    getPage(world.primary_timeline_page_id).then(({ data }) => {
      if (!data) return;
      const sf = data.structured_fields as Record<string, unknown> | null;
      const schema = sf?.__calendar_schema as TimelineCalendarSchema | undefined;
      if (schema?.eras) setCalendarSchema(schema);
    });
  }, [world?.primary_timeline_page_id]);

  const { pageCounts, totalPages } = useMemo(() => {
    const counts: Record<string, number> = {};
    const pages = pagesByWorld ?? [];
    for (const p of pages) {
      counts[p.section_id] = (counts[p.section_id] ?? 0) + 1;
    }
    return { pageCounts: counts, totalPages: pages.length };
  }, [pagesByWorld]);

  const dateValues = world?.current_date_values as Record<string, string> | null;
  const currentEra = useMemo(() => {
    if (!dateValues?.era || !calendarSchema) return null;
    return calendarSchema.eras.find((e) => e.key === dateValues.era) ?? null;
  }, [dateValues, calendarSchema]);

  const formattedDate = useMemo(() => {
    if (!dateValues || !currentEra) return null;
    const parts: string[] = [];
    for (const level of currentEra.dateLevels) {
      const val = dateValues[level.key];
      if (val) parts.push(`${val} ${level.label}`);
    }
    return parts.length > 0 ? parts.join(', ') : null;
  }, [dateValues, currentEra]);

  const nextSessionInfo = useMemo(() => {
    const nextCampaign = linkedCampaigns.find((c) => c.next_session_at);
    if (!nextCampaign?.next_session_at) return null;
    const sessionNum = totalSessions + 1;
    const date = new Date(nextCampaign.next_session_at);
    const now = new Date();
    const diffDays = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    let countdown: string;
    if (diffDays < 0) countdown = 'Past due';
    else if (diffDays === 0) countdown = 'Today';
    else if (diffDays === 1) countdown = 'Tomorrow';
    else countdown = `In ${diffDays} days`;
    const dayTime = date.toLocaleDateString(undefined, { weekday: 'long' })
      + ' ' + date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return { sessionNum, dayTime, countdown, campaignId: nextCampaign.id };
  }, [linkedCampaigns, totalSessions]);

  const nextSessionLine = nextSessionInfo
    ? `Session ${nextSessionInfo.sessionNum} ${nextSessionInfo.countdown.toLowerCase()}`
    : null;

  useEffect(() => {
    if (!nextSessionInfo || !worldId) { setPrepPage(null); return; }
    const campaign = linkedCampaigns.find((c) => c.id === nextSessionInfo.campaignId);

    function resolve(pageId: string) {
      getPage(pageId).then(({ data }) => {
        if (data) setPrepPage({
          id: data.id,
          title: data.title,
          bodyText: data.body_text ?? null,
          bodyRefs: data.body_refs ?? [],
        });
      });
    }

    if (campaign?.next_session_prep_page_id) {
      resolve(campaign.next_session_prep_page_id);
      return;
    }
    const pages = pagesByWorld ?? [];
    const num = nextSessionInfo.sessionNum;
    const pattern = new RegExp(`session\\s*${num}\\b`, 'i');
    const match = pages.find((p) => pattern.test(p.title));
    if (match) {
      resolve(match.id);
    } else {
      setPrepPage(null);
    }
  }, [nextSessionInfo, linkedCampaigns, pagesByWorld, worldId]);

  const sessionSubtitle = useMemo(() => {
    if (!prepPage || !nextSessionInfo) return null;
    const stripped = prepPage.title
      .replace(new RegExp(`^session\\s*${nextSessionInfo.sessionNum}\\s*[-—:]?\\s*`, 'i'), '')
      .trim();
    return stripped.length > 0 ? stripped : null;
  }, [prepPage, nextSessionInfo]);

  const prepPreview = useMemo(() => {
    if (!prepPage?.bodyText) return null;
    const lines = prepPage.bodyText.split('\n').filter((l) => l.trim().length > 0);
    const preview = lines.slice(0, 3).join(' ');
    return preview.length > 200 ? preview.slice(0, 197) + '…' : preview;
  }, [prepPage]);

  const mentionChips = useMemo(() => {
    if (!prepPage?.bodyRefs.length || !pagesByWorld) return [];
    const pageMap = new Map(pagesByWorld.map((p) => [p.id, p]));
    return prepPage.bodyRefs
      .map((id) => pageMap.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({ id: p.id, title: p.title }));
  }, [prepPage, pagesByWorld]);

  const partyGridStyle = useMemo(() => {
    const count = partyMembers.length;
    const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 6 ? 3 : 4;
    return {
      display: 'grid' as const,
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: spacing.md,
    };
  }, [partyMembers.length]);

  async function handleStartSession(campaign: Campaign) {
    const { data } = await getCampaignMembers(campaign.id);
    const members = (data ?? []) as unknown as Array<{
      user_id: string; role: string;
      profiles: { display_name: string | null } | null;
      characters: { name: string } | null;
    }>;
    setSessionPlayers(
      members.filter((m) => m.role === 'player').map((m) => ({
        userId: m.user_id,
        displayName: m.profiles?.display_name ?? 'Anonymous',
        characterName: m.characters?.name ?? null,
      })),
    );
    setStartModalCampaign(campaign);
  }

  async function handleConfirmStart(pickedUserIds: string[]) {
    if (!startModalCampaign || startingSession) return;
    setStartingSession(true);
    const { data } = await startSession(startModalCampaign.id, pickedUserIds);
    setStartingSession(false);
    if (data) {
      setActiveSessionCampaignId(startModalCampaign.id);
      setStartModalCampaign(null);
    }
  }

  if (!world || !worldId) return null;

  const handleSectionPress = (section: WorldSection) => {
    setActiveSectionId(section.id);
    router.push(worldSectionHref(worldId, section.id));
  };

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'chronicle', label: 'Chronicle' },
          { key: 'world', label: world.name },
        ]}
        actions={
          <>
            <GhostButton label="New page" onPress={() => setCreatePageSectionId(sections[0]?.id ?? null)} />
            <GradientButton label="New section" onPress={() => setCreateSectionOpen(true)} />
          </>
        }
      />

      <ScrollView contentContainerStyle={styles.container}>
        {/* Hero banner */}
        <View style={styles.heroBanner}>
          {world.cover_image_url ? (
            <Image source={{ uri: world.cover_image_url }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={[colors.primaryContainer + '44', colors.surfaceContainerLowest]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroPlaceholder}
            />
          )}
          <LinearGradient
            colors={['transparent', colors.surfaceCanvas]}
            locations={[0.3, 1]}
            style={styles.heroScrim}
          />

          {/* Top toolbar */}
          <View style={styles.heroToolbar}>
            {!world.cover_image_url ? (
              <View style={styles.placeholderBadge}>
                <Icon name="auto-fix-high" size={14} color={colors.onSurfaceVariant} />
                <Text
                  variant="label-sm"
                  weight="semibold"
                  uppercase
                  style={{ color: colors.onSurfaceVariant, letterSpacing: 1.2 }}
                >
                  Placeholder cover
                </Text>
              </View>
            ) : (
              <View />
            )}
            {activeSessionCampaignId ? (
              <Pressable
                onPress={() => router.push(`/campaign/${activeSessionCampaignId}`)}
                style={styles.liveSessionBadge}
              >
                <View style={styles.liveDot} />
                <Text variant="label-sm" weight="bold" style={{ color: colors.hpHealthy }}>
                  Session Live
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
          </View>

          {/* Bottom overlay */}
          <View style={styles.heroOverlay}>
            <Text
              variant="label-sm"
              weight="semibold"
              uppercase
              style={styles.heroMeta}
            >
              {[
                'Chronicle',
                `${sections.length} section${sections.length !== 1 ? 's' : ''}`,
                ...(totalSessions > 0 ? [`${totalSessions} session${totalSessions !== 1 ? 's' : ''}`] : []),
                ...(linkedCampaigns.length > 0
                  ? [`${linkedCampaigns.length} campaign${linkedCampaigns.length !== 1 ? 's' : ''}`]
                  : []),
              ].join('  ·  ')}
            </Text>
            <Text
              variant="display-lg"
              family="serif-display"
              weight="bold"
              style={styles.heroTitle}
              numberOfLines={2}
            >
              {world.name}
            </Text>
            {currentEra || formattedDate || nextSessionLine ? (
              <View style={styles.heroSubline}>
                {currentEra ? (
                  <View style={styles.eraChip}>
                    <Text
                      variant="label-sm"
                      weight="bold"
                      uppercase
                      style={{ color: colors.primary, letterSpacing: 0.8 }}
                    >
                      {currentEra.label}
                    </Text>
                  </View>
                ) : null}
                {formattedDate ? (
                  <Text
                    variant="body-md"
                    family="serif-body"
                    style={{ color: colors.onSurfaceVariant, fontStyle: 'italic' }}
                  >
                    {formattedDate}
                  </Text>
                ) : null}
                {nextSessionLine ? (
                  <Text
                    variant="body-md"
                    family="serif-body"
                    style={{ color: colors.onSurfaceVariant, fontStyle: 'italic' }}
                  >
                    {(currentEra || formattedDate) ? '· ' : ''}{nextSessionLine}
                  </Text>
                ) : null}
              </View>
            ) : world.description ? (
              <Text
                variant="body-lg"
                family="serif-body"
                tone="secondary"
                style={styles.heroDescription}
                numberOfLines={3}
              >
                {world.description}
              </Text>
            ) : null}
          </View>
        </View>

        {linkedCampaigns.length > 0 ? (
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <MetaLabel size="sm" tone="muted">
              Linked campaigns
            </MetaLabel>
            <View style={styles.chipRow}>
              {linkedCampaigns.map((c) => (
                <Chip key={c.id} label={c.name} variant="category" />
              ))}
            </View>
          </View>
        ) : null}

        {(partyMembers.length > 0 || linkedCampaigns.length > 0) ? (
          <View style={styles.dashboardRow}>
            {/* Party section — left half */}
            {partyMembers.length > 0 ? (
              <View style={styles.partyContainer}>
                <View style={styles.partySectionHeader}>
                  <View style={styles.partyTitleRow}>
                    <Icon name="groups" size={18} color={colors.primary} />
                    <Text
                      variant="label-sm"
                      weight="semibold"
                      uppercase
                      style={{ color: colors.primary, letterSpacing: 1.2 }}
                    >
                      The Party
                    </Text>
                    <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                      ·  Level {Math.round(partyMembers.reduce((s, m) => s + m.level, 0) / partyMembers.length)}
                    </Text>
                  </View>
                  {isOwner && linkedCampaigns.length > 0 ? (
                    <Pressable onPress={() => router.push(`/campaign/${linkedCampaigns[0].id}`)}>
                      <Text variant="label-md" style={{ color: colors.onSurfaceVariant }}>
                        Manage Players →
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={partyGridStyle as object}>
                  {partyMembers.map((member) => {
                    const hpPct = member.hpMax > 0 ? member.hpCurrent / member.hpMax : 1;
                    const hpColor = hpPct > 0.5 ? colors.hpHealthy : hpPct > 0.25 ? colors.hpWarning : colors.hpDanger;
                    return (
                      <View key={member.userId} style={styles.partyCard}>
                        <View style={styles.partyCardRow}>
                          <View style={[styles.partyAvatar, { backgroundColor: hpColor + '33' }]}>
                            <Text variant="label-sm" weight="bold" style={{ color: hpColor }}>
                              {member.initials}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text variant="body-md" weight="semibold" numberOfLines={1}>
                              {member.characterName}
                            </Text>
                            <Text variant="body-sm" style={{ color: colors.onSurfaceVariant }} numberOfLines={1}>
                              {[member.species, member.className].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.partyStats}>
                          <Text variant="label-sm" weight="bold" style={{ color: hpColor }}>
                            {member.hpCurrent}
                          </Text>
                          <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                            /{member.hpMax} HP
                          </Text>
                          <Text variant="label-sm" weight="semibold" style={styles.acBadge}>
                            AC {member.ac}
                          </Text>
                        </View>
                        <View style={styles.hpBarTrack}>
                          <View style={[styles.hpBarFill, { width: `${Math.max(hpPct * 100, 2)}%`, backgroundColor: hpColor }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Next Session card — right half */}
            {linkedCampaigns.length > 0 ? (
              <View style={styles.nextSessionCard}>
                {nextSessionInfo ? (
                  <>
                    <View style={styles.nextSessionHeader}>
                      <View style={styles.nextSessionMeta}>
                        <Icon name="event" size={14} color={colors.primary} />
                        <Text
                          variant="label-sm"
                          weight="semibold"
                          uppercase
                          style={{ color: colors.primary, letterSpacing: 1.2 }}
                        >
                          Next Session
                        </Text>
                        <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                          ·  {nextSessionInfo.dayTime}
                        </Text>
                      </View>
                      <View style={styles.countdownBadge}>
                        <Text
                          variant="label-sm"
                          weight="semibold"
                          uppercase
                          style={{ color: colors.primary, letterSpacing: 0.8 }}
                        >
                          {nextSessionInfo.countdown}
                        </Text>
                      </View>
                    </View>

                    <Text
                      variant="title-lg"
                      family="serif-display"
                      weight="bold"
                      style={{ color: colors.onSurface, marginTop: spacing.sm }}
                    >
                      Session {nextSessionInfo.sessionNum}
                      {sessionSubtitle ? ` — ${sessionSubtitle}` : ''}
                    </Text>

                    {prepPreview ? (
                      <Text
                        variant="body-sm"
                        style={{ color: colors.onSurfaceVariant, marginTop: spacing.xs }}
                        numberOfLines={3}
                      >
                        {prepPreview}
                      </Text>
                    ) : !prepPage ? (
                      <Text
                        variant="body-sm"
                        style={{ color: colors.onSurfaceVariant, marginTop: spacing.xs, fontStyle: 'italic' }}
                      >
                        Create a page titled "Session {nextSessionInfo.sessionNum}" to link prep notes here.
                      </Text>
                    ) : null}

                    {mentionChips.length > 0 ? (
                      <View style={styles.mentionChipRow}>
                        {mentionChips.map((chip) => (
                          <Pressable
                            key={chip.id}
                            onPress={() => router.push(worldPageHref(worldId, chip.id))}
                            style={styles.mentionChip}
                          >
                            <Icon name="circle" size={6} color={colors.primary} />
                            <Text variant="label-sm" style={{ color: colors.onSurface }}>
                              {chip.title}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.nextSessionActions}>
                      {isOwner && !activeSessionCampaignId ? (
                        <GradientButton
                          label="Start Session"
                          icon="play-arrow"
                          onPress={() => {
                            const campaign = linkedCampaigns.find((c) => c.id === nextSessionInfo.campaignId);
                            if (campaign) handleStartSession(campaign);
                          }}
                        />
                      ) : null}
                      {prepPage ? (
                        <Pressable
                          onPress={() => router.push(worldPageHref(worldId, prepPage.id))}
                          style={styles.sessionNotesBtn}
                        >
                          <Icon name="description" size={16} color={colors.onSurfaceVariant} />
                          <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                            Session Notes
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.nextSessionMeta}>
                      <Icon name="event" size={14} color={colors.outline} />
                      <Text
                        variant="label-sm"
                        weight="semibold"
                        uppercase
                        style={{ color: colors.outline, letterSpacing: 1.2 }}
                      >
                        Next Session
                      </Text>
                    </View>
                    <Text
                      variant="body-sm"
                      style={{ color: colors.onSurfaceVariant, marginTop: spacing.sm, fontStyle: 'italic' }}
                    >
                      Set a date in World Settings to schedule your next session.
                    </Text>
                    {isOwner && !activeSessionCampaignId ? (
                      <View style={{ marginTop: spacing.lg }}>
                        <GradientButton
                          label="Start Session"
                          icon="play-arrow"
                          onPress={() => {
                            const campaign = linkedCampaigns.find((c) => c.dm_user_id === user?.id);
                            if (campaign) handleStartSession(campaign);
                          }}
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Opening prose block */}
        <View style={{ marginTop: spacing.xl + spacing.sm }}>
          <WorldOpeningBlock
            world={world}
            worldId={worldId}
            isOwner={isOwner}
            systemLabel={linkedCampaigns.length > 0 ? 'D&D 5E' : null}
            partyLevel={partyMembers.length > 0
              ? Math.round(partyMembers.reduce((s, m) => s + m.level, 0) / partyMembers.length)
              : null}
          />
        </View>

        {/* The World — section cards */}
        <View style={{ marginTop: spacing.xl + spacing.sm, gap: spacing.md }}>
          <View style={styles.sectionHeadingRow}>
            <View style={{ flex: 1 }}>
              <Text
                variant="headline-sm"
                family="serif-display"
                weight="bold"
                style={{ color: colors.onSurface }}
              >
                The World
              </Text>
              <Text variant="body-md" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
                Overarching lore — shared context for every session
              </Text>
            </View>
            {isOwner ? (
              <GhostButton label="+ Add Section" onPress={() => setCreateSectionOpen(true)} />
            ) : null}
          </View>
          <View style={ATLAS_GRID_STYLE as object}>
            {sections.map((section) => {
              const template = getTemplate(section.template_key);
              return (
                <WorldSectionCard
                  key={section.id}
                  section={section}
                  template={template}
                  pageCount={pageCounts[section.id] ?? 0}
                  onPress={() => handleSectionPress(section)}
                />
              );
            })}
            {isOwner ? (
              <WorldSectionAddCard
                onPress={() => setCreateSectionOpen(true)}
                subtitle="Pantheon, calendar, languages…"
              />
            ) : null}
          </View>
        </View>
      </ScrollView>

      {createSectionOpen ? (
        <CreateSectionModal worldId={worldId} onClose={() => setCreateSectionOpen(false)} />
      ) : null}

      {createPageSectionId ? (
        <CreatePageModal
          worldId={worldId}
          sectionId={createPageSectionId}
          onClose={() => setCreatePageSectionId(null)}
        />
      ) : null}

      {startModalCampaign ? (
        <StartSessionModal
          visible
          players={sessionPlayers}
          starting={startingSession}
          onClose={() => setStartModalCampaign(null)}
          onConfirm={handleConfirmStart}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  container: {
    maxWidth: 1400,
    alignSelf: 'center',
    width: '100%',
    paddingTop: 28,
    paddingHorizontal: 36,
    paddingBottom: spacing['2xl'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  heroBanner: {
    width: '100%',
    aspectRatio: 21 / 7,
    minHeight: 200,
    maxHeight: 360,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spacing.lg,
    backgroundColor: colors.surfaceContainerLow,
  },
  heroImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  heroToolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.md,
    zIndex: 2,
  },
  placeholderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '66',
    backgroundColor: colors.surfaceContainerHigh + '99',
  },
  liveSessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHigh + '99',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.hpHealthy,
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    paddingBottom: spacing.lg,
  },
  heroMeta: {
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    color: colors.onSurface,
    fontSize: 48,
    lineHeight: 52,
    letterSpacing: -1,
  },
  heroSubline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  eraChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary + '66',
  },
  heroDescription: {
    color: colors.onSurfaceVariant,
    maxWidth: 600,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  dashboardRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl + spacing.sm,
    alignItems: 'flex-start',
  },
  nextSessionCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
  },
  nextSessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextSessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countdownBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary + '66',
  },
  mentionChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.md,
  },
  mentionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    backgroundColor: colors.surfaceContainerHigh + '88',
  },
  nextSessionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  sessionNotesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  partyContainer: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
  },
  partySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  partyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  partyCard: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs + 2,
  },
  partyCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  partyAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partyStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 2,
  },
  acBadge: {
    color: colors.onSurfaceVariant,
    marginLeft: spacing.sm,
  },
  hpBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant + '33',
  },
  hpBarFill: {
    height: 3,
    borderRadius: 2,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
});
