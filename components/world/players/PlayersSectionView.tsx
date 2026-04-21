import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  getCampaignsForWorld,
  getCharactersByIds,
} from '@vaultstone/api';
import type { SectionTemplate, WorldPage, Database } from '@vaultstone/types';
import {
  Card,
  GradientButton,
  Icon,
  MetaLabel,
  Text,
  colors,
  fonts,
  radius,
  spacing,
} from '@vaultstone/ui';

import { PCCard } from './PCCard';
import { SectionPageList } from '../SectionPageList';
import { worldPageHref } from '../worldHref';

type Character = Database['public']['Tables']['characters']['Row'];
type Dnd5eStats = { level?: number; hpMax?: number };
type Dnd5eResources = { hpCurrent?: number; xp?: number };

type Props = {
  worldId: string;
  pages: WorldPage[];
  template: SectionTemplate;
  onCreatePage: () => void;
};

export function PlayersSectionView({ worldId, pages, template, onCreatePage }: Props) {
  const router = useRouter();
  const [characters, setCharacters] = useState<Map<string, Character>>(new Map());
  const [playerNames, setPlayerNames] = useState<Map<string, string>>(new Map());

  const stubPages = useMemo(
    () => pages.filter((p) => p.page_kind === 'pc_stub' || p.page_kind === 'player_character'),
    [pages],
  );
  const customPages = useMemo(
    () => pages.filter((p) => p.page_kind === 'custom'),
    [pages],
  );

  const characterIds = useMemo(
    () => stubPages.map((p) => p.character_id).filter((id): id is string => id != null),
    [stubPages],
  );

  useEffect(() => {
    if (characterIds.length === 0) return;
    let cancelled = false;
    getCharactersByIds(characterIds).then(({ data }) => {
      if (cancelled || !data) return;
      const map = new Map<string, Character>();
      for (const c of data) map.set(c.id, c);
      setCharacters(map);
    });
    return () => { cancelled = true; };
  }, [characterIds.join(',')]);

  useEffect(() => {
    let cancelled = false;
    getCampaignsForWorld(worldId).then(({ data }) => {
      if (cancelled || !data) return;
      // TODO: resolve player display names from campaign members
      // For now we leave playerNames empty — the PCCard shows "played by" only when available
    });
    return () => { cancelled = true; };
  }, [worldId]);

  const openPage = useCallback(
    (page: WorldPage) => router.push(worldPageHref(worldId, page.id)),
    [router, worldId],
  );

  // Summary stats
  const partySize = stubPages.filter((p) => !p.is_orphaned).length;
  const charRows = stubPages
    .filter((p) => !p.is_orphaned && p.character_id)
    .map((p) => characters.get(p.character_id!))
    .filter((c): c is Character => c != null);

  const avgLevel = charRows.length > 0
    ? (charRows.reduce((s, c) => s + ((c.base_stats as unknown as Dnd5eStats)?.level ?? 1), 0) / charRows.length).toFixed(1)
    : '—';
  const totalHp = charRows.reduce(
    (s, c) => s + ((c.resources as unknown as Dnd5eResources)?.hpCurrent ?? 0),
    0,
  );
  const maxHp = charRows.reduce(
    (s, c) => s + ((c.base_stats as unknown as Dnd5eStats)?.hpMax ?? 0),
    0,
  );
  const totalXp = charRows.reduce(
    (s, c) => s + ((c.resources as unknown as Dnd5eResources)?.xp ?? 0),
    0,
  );

  const orphanedPages = stubPages.filter((p) => p.is_orphaned);
  const activeStubs = stubPages.filter((p) => !p.is_orphaned);

  return (
    <View style={styles.container}>
      {/* Summary stats */}
      <View style={styles.summary}>
        <SummaryStat num={String(partySize)} label="Characters" />
        <SummaryStat num={avgLevel} label="Avg Level" />
        <SummaryStat
          num={charRows.length > 0 ? String(totalHp) : '—'}
          suffix={charRows.length > 0 ? ` / ${maxHp}` : undefined}
          label="Party HP"
        />
        <SummaryStat
          num={totalXp > 0 ? `${(totalXp / 1000).toFixed(1)}k` : '—'}
          label="Total XP"
        />
      </View>

      {/* Active PC cards */}
      {activeStubs.length > 0 ? (
        <View style={styles.cardList}>
          {activeStubs.map((page) => (
            <PCCard
              key={page.id}
              characterName={page.title}
              playerName={playerNames.get(page.character_id ?? '') ?? null}
              character={page.character_id ? characters.get(page.character_id) ?? null : null}
              isOrphaned={false}
              onPress={() => openPage(page)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <Icon name="group" size={32} color={colors.outlineVariant} />
          <Text variant="title-md" family="serif-display" weight="semibold" style={{ marginTop: spacing.sm }}>
            No player characters yet
          </Text>
          <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.xs, textAlign: 'center', maxWidth: 400, color: colors.onSurfaceVariant }}>
            Link a campaign with active players to this world, and character stubs will appear here automatically.
          </Text>
        </View>
      )}

      {/* Orphaned stubs */}
      {orphanedPages.length > 0 ? (
        <View style={styles.orphanSection}>
          <View style={styles.orphanHeader}>
            <Icon name="link-off" size={14} color={colors.hpWarning} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.hpWarning }}>
              Orphaned Characters ({orphanedPages.length})
            </Text>
          </View>
          {orphanedPages.map((page) => (
            <PCCard
              key={page.id}
              characterName={page.title}
              playerName={null}
              character={page.character_id ? characters.get(page.character_id) ?? null : null}
              isOrphaned
              onPress={() => openPage(page)}
            />
          ))}
        </View>
      ) : null}

      {/* Custom handout pages */}
      {customPages.length > 0 ? (
        <View style={styles.handoutsSection}>
          <View style={styles.handoutsHeader}>
            <Icon name="article" size={14} color={colors.onSurfaceVariant} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
              Handouts & Custom Pages ({customPages.length})
            </Text>
          </View>
          <SectionPageList pages={customPages} template={template} onPagePress={openPage} />
        </View>
      ) : null}

      {/* Create page button */}
      <View style={{ marginTop: spacing.lg, alignItems: 'flex-start' }}>
        <GradientButton label="Add handout page" onPress={onCreatePage} />
      </View>
    </View>
  );
}

function SummaryStat({ num, suffix, label }: { num: string; suffix?: string; label: string }) {
  return (
    <Card tier="container" padding="md" style={styles.statCard}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={styles.statNum}>{num}</Text>
        {suffix ? <Text style={styles.statSuffix}>{suffix}</Text> : null}
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.lg,
  },
  summary: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
  },
  statNum: {
    fontFamily: fonts.headline,
    fontSize: 24,
    fontWeight: '600',
    color: colors.onSurface,
  },
  statSuffix: {
    fontFamily: fonts.headline,
    fontSize: 14,
    color: colors.outline,
  },
  statLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.outline,
    marginTop: 2,
  },
  cardList: {
    gap: 0,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  orphanSection: {
    gap: spacing.sm,
  },
  orphanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  handoutsSection: {
    gap: spacing.sm,
  },
  handoutsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
});
