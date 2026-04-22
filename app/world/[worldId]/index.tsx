import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getActiveSession,
  getCampaignMembers,
  getCampaignsForWorld,
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
import {
  WorldSectionAddCard,
  WorldSectionCard,
} from '../../../components/world/WorldSectionCard';
import { WorldTopBar } from '../../../components/world/WorldTopBar';
import { worldSectionHref } from '../../../components/world/worldHref';
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
  initials: string;
};

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/^Srd /, '');
}

// CSS grid lives inline; see note in SectionPageGrid.tsx.
const PARTY_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: spacing.md,
} as const;

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
  const [linkedCampaigns, setLinkedCampaigns] = useState<Campaign[]>([]);
  const [createSectionOpen, setCreateSectionOpen] = useState(false);
  const [createPageSectionId, setCreatePageSectionId] = useState<string | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [calendarSchema, setCalendarSchema] = useState<TimelineCalendarSchema | null>(null);
  const [activeSessionCampaignId, setActiveSessionCampaignId] = useState<string | null>(null);
  const [startModalCampaign, setStartModalCampaign] = useState<Campaign | null>(null);
  const [sessionPlayers, setSessionPlayers] = useState<StartSessionPlayer[]>([]);
  const [startingSession, setStartingSession] = useState(false);
  const [campaignPickerOpen, setCampaignPickerOpen] = useState(false);
  const [partyMembers, setPartyMembers] = useState<PartyMember[]>([]);

  const isOwner = !!(user && world && user.id === world.owner_user_id);
  const dmCampaigns = useMemo(
    () => linkedCampaigns.filter((c) => c.dm_user_id === user?.id),
    [linkedCampaigns, user?.id],
  );

  useEffect(() => {
    if (!worldId) return;
    getCampaignsForWorld(worldId).then(({ data }) => {
      const rows = (data ?? []) as unknown as Array<{ campaigns: Campaign | null }>;
      const campaigns = rows.map((r) => r.campaigns).filter((c): c is Campaign => !!c);
      setLinkedCampaigns(campaigns);
      if (campaigns.length > 0) {
        Promise.all(campaigns.map((c) => getCompletedSessionCount(c.id))).then(
          (results) => setTotalSessions(results.reduce((sum, r) => sum + r.count, 0)),
        );
        Promise.all(campaigns.map((c) => getActiveSession(c.id))).then((results) => {
          const active = results.find((r) => r.data);
          if (active?.data) {
            const session = active.data as { id: string; campaign_id: string };
            setActiveSessionCampaignId(session.campaign_id);
          }
        });
        Promise.all(campaigns.map((c) => getCampaignMembers(c.id))).then((results) => {
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
              const stats = raw.characters.base_stats as { level?: number; hpMax?: number; speciesKey?: string; classKey?: string } | null;
              const res = raw.characters.resources as { hpCurrent?: number } | null;
              const name = raw.characters.name;
              const initials = name.split(/\s+/).map((w) => w[0]?.toUpperCase()).join('').slice(0, 2);
              members.push({
                userId: raw.user_id,
                displayName: raw.profiles?.display_name ?? 'Anonymous',
                characterName: name,
                species: stats?.speciesKey ? formatKey(stats.speciesKey) : null,
                className: stats?.classKey ? formatKey(stats.classKey) : null,
                level: stats?.level ?? 1,
                hpCurrent: res?.hpCurrent ?? stats?.hpMax ?? 0,
                hpMax: stats?.hpMax ?? 0,
                initials,
              });
            }
          }
          setPartyMembers(members);
        });
      }
    });
  }, [worldId]);

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

  const nextSessionLine = useMemo(() => {
    const nextCampaign = linkedCampaigns.find((c) => c.next_session_at);
    if (!nextCampaign?.next_session_at) return null;
    const sessionNum = totalSessions + 1;
    const date = new Date(nextCampaign.next_session_at);
    const now = new Date();
    const diffDays = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    let when: string;
    if (diffDays < 0) when = 'past due';
    else if (diffDays === 0) when = 'today';
    else if (diffDays === 1) when = 'tomorrow';
    else if (diffDays < 7) when = date.toLocaleDateString(undefined, { weekday: 'long' });
    else when = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `Session ${sessionNum} ${when}`;
  }, [linkedCampaigns, totalSessions]);

  async function handleStartSessionFor(campaign: Campaign) {
    setCampaignPickerOpen(false);
    const { data } = await getCampaignMembers(campaign.id);
    const members = (data ?? []) as unknown as Array<{
      user_id: string;
      role: string;
      profiles: { display_name: string | null } | null;
      characters: { name: string } | null;
    }>;
    setSessionPlayers(
      members
        .filter((m) => m.role === 'player')
        .map((m) => ({
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

  function handleStartSessionClick() {
    if (dmCampaigns.length === 1) {
      handleStartSessionFor(dmCampaigns[0]);
    } else if (dmCampaigns.length > 1) {
      setCampaignPickerOpen(!campaignPickerOpen);
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
            <View style={styles.heroActions}>
              {dmCampaigns.length > 0 && !activeSessionCampaignId ? (
                <View>
                  <GradientButton
                    label="Start Session"
                    icon="play-arrow"
                    onPress={handleStartSessionClick}
                    style={styles.heroBtnCompact}
                  />
                  {campaignPickerOpen && dmCampaigns.length > 1 ? (
                    <View style={styles.campaignPicker}>
                      {dmCampaigns.map((c) => (
                        <Pressable
                          key={c.id}
                          onPress={() => handleStartSessionFor(c)}
                          style={styles.campaignPickerItem}
                        >
                          <Text variant="body-sm" style={{ color: colors.onSurface }}>
                            {c.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
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
              ) : null}
            </View>
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

        {partyMembers.length > 0 ? (
          <View style={{ marginTop: spacing.xl + spacing.sm }}>
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
            <View style={PARTY_GRID_STYLE as object}>
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

        <View style={{ marginTop: spacing.xl + spacing.sm, gap: spacing.md }}>
          <MetaLabel size="sm" tone="accent">
            The Atlas
          </MetaLabel>
          <Text
            variant="headline-sm"
            family="serif-display"
            weight="bold"
            style={{ color: colors.onSurface }}
          >
            Sections in this world
          </Text>
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
            <WorldSectionAddCard onPress={() => setCreateSectionOpen(true)} />
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
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroBtnCompact: {
    height: 36,
    paddingHorizontal: spacing.md,
  },
  campaignPicker: {
    position: 'absolute',
    top: 40,
    right: 0,
    minWidth: 180,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    overflow: 'hidden',
    zIndex: 20,
  },
  campaignPickerItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
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
  hpBarTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant + '33',
  },
  hpBarFill: {
    height: 3,
    borderRadius: 2,
  },
});
