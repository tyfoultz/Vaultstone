import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { Database, Json, Dnd5eStats, Dnd5eResources, Dnd5eEquipmentItem } from '@vaultstone/types';
import { Card, Icon, Text, colors, fonts, radius, spacing } from '@vaultstone/ui';

type Character = Database['public']['Tables']['characters']['Row'];

type Props = {
  characterName: string;
  playerName: string | null;
  character: Character | null;
  isOrphaned: boolean;
  onPress: () => void;
  onSheetPress?: () => void;
};

const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
const ABILITY_ABBR: Record<string, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

function mod(val: number): string {
  const m = Math.floor((val - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function PCCard({ characterName, playerName, character, isOrphaned, onPress, onSheetPress }: Props) {
  const stats = character?.base_stats as unknown as Dnd5eStats | null;
  const resources = character?.resources as unknown as Dnd5eResources | null;
  const conditions = character?.conditions ?? [];

  const hpCurrent = resources?.hpCurrent ?? 0;
  const hpMax = stats?.hpMax ?? 1;
  const hpPct = Math.round((hpCurrent / hpMax) * 100);
  const hpColor = hpPct < 30 ? colors.hpDanger : hpPct < 60 ? colors.hpWarning : colors.player;

  const ac = computeAC(stats, resources);
  const speed = stats?.speed ?? 30;
  const passivePerception = computePassivePerception(stats);
  const level = stats?.level ?? 1;

  const speciesLabel = stats?.speciesKey?.replace(/-/g, ' ') ?? '';
  const classLabel = stats?.classKey?.replace(/-/g, ' ') ?? '';
  const bgLabel = stats?.backgroundKey?.replace(/-/g, ' ') ?? '';

  const hooks = extractHooks(resources);
  const inventory = extractInventory(resources);

  return (
    <Pressable onPress={onPress}>
      <Card tier="container" padding="sm" style={styles.card}>
        {/* Top row: portrait + headline + actions */}
        <LinearGradient
          colors={[colors.surfaceContainerHigh, colors.surfaceContainer]}
          style={styles.top}
        >
          <View style={[styles.portrait, isOrphaned && styles.portraitOrphaned]}>
            <Text style={styles.portraitText}>{getInitials(characterName)}</Text>
          </View>

          <View style={styles.headline}>
            <View style={styles.nameRow}>
              <Text variant="title-md" family="serif-display" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                {characterName}
              </Text>
              {playerName ? (
                <Text variant="label-sm" tone="secondary" style={styles.playerLabel}>
                  played by {playerName}
                </Text>
              ) : null}
              <View style={styles.levelBadge}>
                <Icon name="flash-on" size={10} color={colors.player} />
                <Text variant="label-sm" weight="semibold" style={{ color: colors.player }}>
                  Lv {level}
                </Text>
              </View>
            </View>
            {(speciesLabel || classLabel) ? (
              <Text variant="body-sm" tone="secondary" numberOfLines={1} style={styles.subline}>
                {[speciesLabel, classLabel, bgLabel].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            {resources?.xp != null ? (
              <Text style={styles.xpLine}>
                XP {resources.xp.toLocaleString()} / {xpForNextLevel(level).toLocaleString()}
              </Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            {onSheetPress ? (
              <Pressable onPress={onSheetPress} style={styles.ghostBtn}>
                <Icon name="description" size={12} color={colors.onSurfaceVariant} />
                <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>Sheet</Text>
              </Pressable>
            ) : null}
          </View>
        </LinearGradient>

        {/* Vitals: HP / AC / Speed / Passive Perception */}
        {character ? (
          <View style={styles.vitals}>
            <View style={styles.vital}>
              <Text style={styles.vitalLabel}>HIT POINTS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.vitalValue}>{hpCurrent}</Text>
                <Text style={styles.vitalMax}> / {hpMax}</Text>
              </View>
              <View style={styles.hpBarTrack}>
                <View style={[styles.hpBarFill, { width: `${Math.min(hpPct, 100)}%`, backgroundColor: hpColor }]} />
              </View>
            </View>
            <View style={[styles.vital, styles.vitalBorder]}>
              <Text style={styles.vitalLabel}>ARMOR CLASS</Text>
              <Text style={styles.vitalValue}>{ac}</Text>
            </View>
            <View style={[styles.vital, styles.vitalBorder]}>
              <Text style={styles.vitalLabel}>SPEED</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.vitalValue}>{speed}</Text>
                <Text style={styles.vitalMax}> ft</Text>
              </View>
            </View>
            <View style={[styles.vital, styles.vitalBorder]}>
              <Text style={styles.vitalLabel}>PASSIVE PERCEP.</Text>
              <Text style={styles.vitalValue}>{passivePerception}</Text>
            </View>
          </View>
        ) : null}

        {/* Ability scores */}
        {stats ? (
          <View style={styles.abilRow}>
            {ABILITY_KEYS.map((key) => {
              const val = stats.abilityScores[key] ?? 10;
              const isSave = stats.savingThrowProficiencies?.includes(key);
              return (
                <View key={key} style={styles.abil}>
                  {isSave ? <View style={styles.saveDot} /> : null}
                  <Text style={styles.abilLabel}>{ABILITY_ABBR[key]}</Text>
                  <Text style={styles.abilValue}>{val}</Text>
                  <Text style={styles.abilMod}>({mod(val)})</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Body: hooks + inventory */}
        {(hooks.length > 0 || inventory.length > 0) ? (
          <View style={styles.body}>
            {hooks.length > 0 ? (
              <View style={styles.col}>
                <View style={styles.colHeader}>
                  <Icon name="auto-awesome" size={11} color={colors.primary} />
                  <Text style={styles.colLabel}>CHARACTER HOOKS</Text>
                </View>
                {hooks.map((h, i) => (
                  <View key={i} style={styles.hook}>
                    <Text variant="body-sm" style={{ color: colors.onSurfaceVariant }}>{h}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {inventory.length > 0 ? (
              <View style={[styles.col, hooks.length > 0 && styles.colBorder]}>
                <View style={styles.colHeader}>
                  <Icon name="description" size={11} color={colors.primary} />
                  <Text style={styles.colLabel}>NOTABLE INVENTORY</Text>
                </View>
                {inventory.map((it, i) => (
                  <View key={i} style={styles.invRow}>
                    <Text style={styles.invDiamond}>◆</Text>
                    <Text variant="body-sm" style={{ color: colors.onSurfaceVariant }}>{it}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Conditions */}
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>ACTIVE STATUS</Text>
          {conditions.length > 0 ? (
            conditions.map((c) => (
              <View key={c} style={styles.statusChip}>
                <Text style={styles.statusChipText}>{c}</Text>
              </View>
            ))
          ) : (
            <View style={styles.statusChipOk}>
              <Text style={styles.statusChipOkText}>✓ No conditions</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.foot}>
          <Icon name="access-time" size={11} color={colors.outline} />
          <Text style={styles.footText}>
            Updated {formatRelativeTime(character?.updated_at)}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={styles.footLink}>Full page</Text>
            <Icon name="arrow-forward" size={11} color={colors.player} />
          </Pressable>
        </View>

        {isOrphaned ? (
          <View style={styles.orphanBanner}>
            <Icon name="link-off" size={12} color={colors.hpWarning} />
            <Text variant="label-sm" style={{ color: colors.hpWarning }}>
              Orphaned — character unlinked or deleted
            </Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

function computeAC(stats: Dnd5eStats | null, resources: Dnd5eResources | null): number {
  if (!stats) return 10;
  const dexMod = Math.floor(((stats.abilityScores?.dexterity ?? 10) - 10) / 2);
  const equipment: Dnd5eEquipmentItem[] = resources?.equipment ?? [];
  const armor = equipment.find((e: Dnd5eEquipmentItem) => e.slot === 'armor' && e.equipped);
  const shield = equipment.find((e: Dnd5eEquipmentItem) => e.slot === 'shield' && e.equipped);
  let ac = 10 + dexMod;
  if (armor) {
    ac = armor.acBase ?? 10;
    if (armor.dexCap === null || armor.dexCap === undefined) {
      ac += dexMod;
    } else {
      ac += Math.min(dexMod, armor.dexCap);
    }
  }
  if (shield) ac += shield.acBonus ?? 2;
  return ac;
}

function computePassivePerception(stats: Dnd5eStats | null): number {
  if (!stats) return 10;
  const wisMod = Math.floor(((stats.abilityScores?.wisdom ?? 10) - 10) / 2);
  const profBonus = Math.ceil(1 + (stats.level ?? 1) / 4);
  const hasProficiency = stats.skillProficiencies?.includes('perception');
  return 10 + wisMod + (hasProficiency ? profBonus : 0);
}

const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
function xpForNextLevel(level: number): number {
  return XP_THRESHOLDS[Math.min(level, XP_THRESHOLDS.length - 1)] ?? 355000;
}

function extractHooks(resources: Dnd5eResources | null): string[] {
  const personality = resources?.personality;
  if (!personality) return [];
  const hooks: string[] = [];
  if (personality.bonds) hooks.push(personality.bonds);
  if (personality.ideals) hooks.push(personality.ideals);
  if (personality.flaws) hooks.push(personality.flaws);
  return hooks.slice(0, 3);
}

function extractInventory(resources: Dnd5eResources | null): string[] {
  const equipment: Dnd5eEquipmentItem[] = resources?.equipment ?? [];
  if (equipment.length === 0) return [];
  return equipment
    .filter((e: Dnd5eEquipmentItem) => e.equipped || e.requiresAttunement)
    .slice(0, 4)
    .map((e: Dnd5eEquipmentItem) => e.name);
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
    marginBottom: spacing.md,
    padding: 0,
  },
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    padding: 18,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  portrait: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: colors.playerContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitOrphaned: {
    backgroundColor: colors.surfaceContainerHighest,
    opacity: 0.6,
  },
  portraitText: {
    fontFamily: fonts.headline,
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.4,
  },
  headline: {
    flex: 1,
    minWidth: 240,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  playerLabel: {
    color: colors.outline,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.player + '44',
    backgroundColor: colors.playerContainer + '66',
  },
  subline: {
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  xpLine: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.outline,
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },

  // Vitals row
  vitals: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  vital: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  vitalBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.outlineVariant,
  },
  vitalLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.outline,
  },
  vitalValue: {
    fontFamily: fonts.headline,
    fontSize: 22,
    fontWeight: '500',
    color: colors.onSurface,
    marginTop: 2,
  },
  vitalMax: {
    fontFamily: fonts.headline,
    fontSize: 14,
    color: colors.outline,
  },
  hpBarTrack: {
    height: 4,
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Ability scores
  abilRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  abil: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: colors.outlineVariant,
  },
  saveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  abilLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.outline,
  },
  abilValue: {
    fontFamily: fonts.headline,
    fontSize: 20,
    fontWeight: '500',
    color: colors.onSurface,
    marginTop: 2,
  },
  abilMod: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 1,
  },

  // Body (hooks + inventory)
  body: {
    flexDirection: 'row',
  },
  col: {
    flex: 1,
    padding: 14,
    paddingHorizontal: 18,
  },
  colBorder: {
    borderLeftWidth: 1,
    borderLeftColor: colors.outlineVariant,
  },
  colHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  colLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.outline,
    fontWeight: '500',
  },
  hook: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.surfaceContainerHigh,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    borderRadius: 3,
    marginBottom: 4,
  },
  invRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  invDiamond: {
    fontSize: 8,
    color: colors.outlineVariant,
  },

  // Status / conditions
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.surfaceContainerHigh,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  statusLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.outline,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hpWarning,
  },
  statusChipText: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.hpWarning,
  },
  statusChipOk: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  statusChipOkText: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.outline,
  },

  // Footer
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  footText: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.outline,
  },
  footLink: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.player,
  },

  // Orphan banner
  orphanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: colors.gmContainer + '66',
    borderTopWidth: 1,
    borderTopColor: colors.hpWarning + '33',
  },
});
