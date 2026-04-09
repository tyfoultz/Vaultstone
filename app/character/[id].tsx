import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getCharacterById, updateCharacter } from '@vaultstone/api';
import { useCharacterStore } from '@vaultstone/store';
import { colors } from '@vaultstone/ui';
import type { Database, Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores } from '@vaultstone/types';
import { HpModal } from '../../components/character-sheet/HpModal';
import { ConditionsPanel } from '../../components/character-sheet/ConditionsPanel';

type Character = Database['public']['Tables']['characters']['Row'];
type Tab = 'overview' | 'combat';

// ─── Derived stat helpers ────────────────────────────────────────────────────

function abilityMod(score: number) {
  return Math.floor((score - 10) / 2);
}

function profBonus(level: number) {
  return Math.floor((level - 1) / 4) + 2;
}

function fmtMod(n: number) {
  return n >= 0 ? `+${n}` : `${n}`;
}

const SKILL_ABILITY: Record<string, keyof Dnd5eAbilityScores> = {
  acrobatics: 'dexterity',
  'animal handling': 'wisdom',
  arcana: 'intelligence',
  athletics: 'strength',
  deception: 'charisma',
  history: 'intelligence',
  insight: 'wisdom',
  intimidation: 'charisma',
  investigation: 'intelligence',
  medicine: 'wisdom',
  nature: 'intelligence',
  perception: 'wisdom',
  performance: 'charisma',
  persuasion: 'charisma',
  religion: 'intelligence',
  'sleight of hand': 'dexterity',
  stealth: 'dexterity',
  survival: 'wisdom',
};

const ALL_SKILLS = Object.keys(SKILL_ABILITY);

const ABILITY_KEYS: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const ABILITY_SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

const ATTRIBUTION = 'Content from the Systems Reference Document 5.1 / 2.0 is available under the Creative Commons Attribution 4.0 International License.';

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function CharacterSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { updateCharacterLocally } = useCharacterStore();

  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [hpModalVisible, setHpModalVisible] = useState(false);

  useEffect(() => {
    if (!id) return;
    getCharacterById(id).then(({ data, error: err }) => {
      if (err) setError('Failed to load character.');
      else setCharacter(data);
      setLoading(false);
    });
  }, [id]);

  const stats = character?.base_stats as Dnd5eStats | null;
  const resources = character?.resources as Dnd5eResources | null;

  // ── Derived stats ─────────────────────────────────────────────────────────

  const prof = stats ? profBonus(stats.level) : 2;
  const scores = stats?.abilityScores;

  function skillMod(skillName: string): number {
    if (!scores || !stats) return 0;
    const ability = SKILL_ABILITY[skillName];
    const base = abilityMod(scores[ability]);
    const isProficient = stats.skillProficiencies.includes(skillName);
    return base + (isProficient ? prof : 0);
  }

  function saveMod(ability: keyof Dnd5eAbilityScores): number {
    if (!scores || !stats) return 0;
    const base = abilityMod(scores[ability]);
    const isProficient = stats.savingThrowProficiencies.includes(ability);
    return base + (isProficient ? prof : 0);
  }

  const ac = scores ? 10 + abilityMod(scores.dexterity) : 10;
  const initiative = scores ? abilityMod(scores.dexterity) : 0;
  const passivePerception = 10 + skillMod('perception');

  // ── HP color ──────────────────────────────────────────────────────────────

  function hpColor(): string {
    if (!resources || !stats) return colors.textPrimary;
    if (resources.hpCurrent === 0) return colors.hpDanger;
    const ratio = resources.hpCurrent / stats.hpMax;
    if (ratio > 0.5) return colors.hpHealthy;
    if (ratio > 0.25) return colors.hpWarning;
    return colors.hpDanger;
  }

  // ── Persist helpers ───────────────────────────────────────────────────────

  async function persistResources(updated: Dnd5eResources) {
    if (!character) return;
    const next = { ...character, resources: updated as unknown as import('@vaultstone/types').Json };
    setCharacter(next);
    updateCharacterLocally(character.id, { resources: updated as unknown as import('@vaultstone/types').Json });
    await updateCharacter(character.id, { resources: updated as unknown as import('@vaultstone/types').Json });
  }

  async function persistConditions(newConditions: string[]) {
    if (!character) return;
    const next = { ...character, conditions: newConditions };
    setCharacter(next);
    updateCharacterLocally(character.id, { conditions: newConditions });
    await updateCharacter(character.id, { conditions: newConditions });
  }

  function handleToggleCondition(condition: string) {
    if (!character) return;
    const current = character.conditions ?? [];
    const lower = condition.toLowerCase();
    const exists = current.map((c) => c.toLowerCase()).includes(lower);
    const next = exists
      ? current.filter((c) => c.toLowerCase() !== lower)
      : [...current, condition];
    persistConditions(next);
  }

  function handleSetExhaustion(level: number) {
    if (!resources) return;
    persistResources({ ...resources, exhaustionLevel: Math.max(0, level) });
  }

  function handleDeathSave(type: 'success' | 'failure') {
    if (!resources) return;
    const current = resources.deathSaves;
    if (type === 'success') {
      persistResources({
        ...resources,
        deathSaves: { ...current, successes: (current.successes + 1) % 4 },
      });
    } else {
      persistResources({
        ...resources,
        deathSaves: { ...current, failures: (current.failures + 1) % 4 },
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (error || !character || !stats || !resources) {
    return (
      <SafeAreaView style={styles.root}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.errorText}>{error || 'Character not found.'}</Text>
      </SafeAreaView>
    );
  }

  const isDead = resources.deathSaves.failures >= 3;
  const isStabilized = resources.hpCurrent === 0 && resources.deathSaves.successes >= 3;
  const showDeathSaves = resources.hpCurrent === 0 && !isDead;
  const activeConditions = character.conditions ?? [];
  const exhaustionLevel = resources.exhaustionLevel ?? 0;

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerName} numberOfLines={1}>{stats.characterName}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['overview', 'combat'] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            scores={scores!}
            prof={prof}
            skillMod={skillMod}
            saveMod={saveMod}
            activeConditions={activeConditions}
            exhaustionLevel={exhaustionLevel}
            passivePerception={passivePerception}
          />
        )}

        {activeTab === 'combat' && (
          <CombatTab
            stats={stats}
            resources={resources}
            ac={ac}
            initiative={initiative}
            hpColor={hpColor()}
            isDead={isDead}
            isStabilized={isStabilized}
            showDeathSaves={showDeathSaves}
            activeConditions={activeConditions}
            exhaustionLevel={exhaustionLevel}
            onHpPress={() => setHpModalVisible(true)}
            onToggleCondition={handleToggleCondition}
            onSetExhaustion={handleSetExhaustion}
            onDeathSave={handleDeathSave}
          />
        )}

        <Text style={styles.attribution}>{ATTRIBUTION}</Text>
      </ScrollView>

      <HpModal
        visible={hpModalVisible}
        resources={resources}
        hpMax={stats.hpMax}
        onClose={() => setHpModalVisible(false)}
        onApply={persistResources}
      />
    </SafeAreaView>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  stats,
  scores,
  prof,
  skillMod,
  saveMod,
  activeConditions,
  exhaustionLevel,
  passivePerception,
}: {
  stats: Dnd5eStats;
  scores: Dnd5eAbilityScores;
  prof: number;
  skillMod: (skill: string) => number;
  saveMod: (ability: keyof Dnd5eAbilityScores) => number;
  activeConditions: string[];
  exhaustionLevel: number;
  passivePerception: number;
}) {
  return (
    <View>
      {/* Identity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identity</Text>
        <Row label="Class" value={capitalize(stats.classKey)} />
        <Row label="Level" value={stats.level.toString()} />
        <Row label="Species" value={capitalize(stats.speciesKey)} />
        <Row label="Background" value={capitalize(stats.backgroundKey)} />
        <Row label="Ruleset" value={stats.srdVersion === 'SRD_2.0' ? 'D&D 5e 2024' : 'D&D 5e 2014'} />
        <Row label="Proficiency Bonus" value={fmtMod(prof)} />
        <Row label="Passive Perception" value={passivePerception.toString()} />
      </View>

      {/* Ability scores */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ability Scores</Text>
        <View style={styles.scoresGrid}>
          {ABILITY_KEYS.map((ability) => (
            <View key={ability} style={styles.scoreCell}>
              <Text style={styles.scoreMod}>{fmtMod(abilityMod(scores[ability]))}</Text>
              <Text style={styles.scoreValue}>{scores[ability]}</Text>
              <Text style={styles.scoreLabel}>{ABILITY_SHORT[ability]}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Saving throws */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saving Throws</Text>
        {ABILITY_KEYS.map((ability) => {
          const proficient = stats.savingThrowProficiencies.includes(ability);
          return (
            <View key={ability} style={styles.skillRow}>
              <View style={[styles.profDot, proficient && styles.profDotFilled]} />
              <Text style={styles.skillName}>{ABILITY_SHORT[ability]}</Text>
              <Text style={styles.skillMod}>{fmtMod(saveMod(ability))}</Text>
            </View>
          );
        })}
      </View>

      {/* Skills */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Skills</Text>
        {ALL_SKILLS.map((skill) => {
          const proficient = stats.skillProficiencies.includes(skill);
          return (
            <View key={skill} style={styles.skillRow}>
              <View style={[styles.profDot, proficient && styles.profDotFilled]} />
              <Text style={styles.skillName}>{titleCase(skill)}</Text>
              <Text style={styles.skillAbility}>({ABILITY_SHORT[SKILL_ABILITY[skill]]})</Text>
              <Text style={styles.skillMod}>{fmtMod(skillMod(skill))}</Text>
            </View>
          );
        })}
      </View>

      {/* Active conditions */}
      {(activeConditions.length > 0 || exhaustionLevel > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Conditions</Text>
          <View style={styles.conditionBadges}>
            {activeConditions.map((c) => (
              <View key={c} style={styles.condBadge}>
                <Text style={styles.condBadgeText}>{c}</Text>
              </View>
            ))}
            {exhaustionLevel > 0 && (
              <View style={[styles.condBadge, styles.condBadgeWarning]}>
                <Text style={styles.condBadgeTextWarning}>Exhaustion {exhaustionLevel}</Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Combat tab ───────────────────────────────────────────────────────────────

function CombatTab({
  stats,
  resources,
  ac,
  initiative,
  hpColor,
  isDead,
  isStabilized,
  showDeathSaves,
  activeConditions,
  exhaustionLevel,
  onHpPress,
  onToggleCondition,
  onSetExhaustion,
  onDeathSave,
}: {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  ac: number;
  initiative: number;
  hpColor: string;
  isDead: boolean;
  isStabilized: boolean;
  showDeathSaves: boolean;
  activeConditions: string[];
  exhaustionLevel: number;
  onHpPress: () => void;
  onToggleCondition: (c: string) => void;
  onSetExhaustion: (level: number) => void;
  onDeathSave: (type: 'success' | 'failure') => void;
}) {
  return (
    <View>
      {/* HP block */}
      <TouchableOpacity style={styles.hpBlock} onPress={onHpPress} activeOpacity={0.75}>
        <Text style={styles.hpLabel}>Hit Points</Text>
        {isDead ? (
          <Text style={[styles.hpCurrent, { color: colors.hpDanger }]}>Dead</Text>
        ) : isStabilized ? (
          <Text style={[styles.hpCurrent, { color: colors.hpWarning }]}>Stabilized (0 HP)</Text>
        ) : (
          <View style={styles.hpRow}>
            <Text style={[styles.hpCurrent, { color: hpColor }]}>{resources.hpCurrent}</Text>
            <Text style={styles.hpSep}>/</Text>
            <Text style={styles.hpMax}>{stats.hpMax}</Text>
          </View>
        )}
        {resources.hpTemp > 0 && (
          <Text style={styles.hpTempBadge}>+{resources.hpTemp} temp HP</Text>
        )}
        <Text style={styles.hpTapHint}>Tap to adjust</Text>
      </TouchableOpacity>

      {/* HP bar */}
      <View style={styles.hpBarTrack}>
        <View
          style={[
            styles.hpBarFill,
            {
              width: `${Math.max(0, Math.min(100, (resources.hpCurrent / stats.hpMax) * 100))}%` as any,
              backgroundColor: hpColor,
            },
          ]}
        />
      </View>

      {/* Combat stats */}
      <View style={styles.statsRow}>
        <StatBox label="AC" value={ac.toString()} />
        <StatBox label="Initiative" value={fmtMod(initiative)} />
        <StatBox label="Speed" value={`${stats.speed}ft`} />
        <StatBox label="Hit Die" value={`d${stats.hitDie}`} />
      </View>

      {/* Death saves */}
      {(showDeathSaves || isDead) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Death Saves</Text>
          <View style={styles.deathSavesRow}>
            <View style={styles.deathSaveSide}>
              <Text style={styles.deathSaveLabel}>Successes</Text>
              <View style={styles.savePips}>
                {[0, 1, 2].map((i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => onDeathSave('success')}
                    style={[styles.savePip, i < resources.deathSaves.successes && styles.savePipSuccess]}
                  />
                ))}
              </View>
            </View>
            <View style={styles.deathSaveSide}>
              <Text style={styles.deathSaveLabel}>Failures</Text>
              <View style={styles.savePips}>
                {[0, 1, 2].map((i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => onDeathSave('failure')}
                    style={[styles.savePip, i < resources.deathSaves.failures && styles.savePipFailure]}
                  />
                ))}
              </View>
            </View>
          </View>
          {isStabilized && (
            <Text style={[styles.deathSaveHint, { color: colors.hpHealthy }]}>
              Stabilized — HP stays at 0 until healed.
            </Text>
          )}
        </View>
      )}

      {/* Conditions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conditions</Text>
        <ConditionsPanel
          conditions={activeConditions}
          exhaustionLevel={exhaustionLevel}
          onToggle={onToggleCondition}
          onSetExhaustion={onSetExhaustion}
        />
      </View>
    </View>
  );
}

// ─── Small reusables ──────────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function titleCase(s: string) {
  return s.split(' ').map(capitalize).join(' ');
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  backBtn: { width: 64 },
  backText: { fontSize: 14, color: colors.brand, fontWeight: '600' },
  headerName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  errorText: { color: colors.hpDanger, textAlign: 'center', marginTop: 40, fontSize: 15 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.brand,
  },
  tabText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.brand },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Section
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // Row (label/value pair)
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 14, color: colors.textSecondary },
  rowValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },

  // Ability scores grid
  scoresGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  scoreCell: { alignItems: 'center', flex: 1 },
  scoreMod: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  scoreValue: { fontSize: 20, fontWeight: '700', color: colors.brand },
  scoreLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600', marginTop: 2 },

  // Skill / save row
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  profDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    backgroundColor: 'transparent',
  },
  profDotFilled: { backgroundColor: colors.brand, borderColor: colors.brand },
  skillName: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  skillAbility: { fontSize: 11, color: colors.textSecondary, marginRight: 8 },
  skillMod: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, minWidth: 28, textAlign: 'right' },

  // Active condition badges
  conditionBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  condBadge: {
    borderWidth: 1,
    borderColor: colors.hpDanger,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: colors.hpDanger + '22',
  },
  condBadgeText: { fontSize: 12, color: colors.hpDanger, fontWeight: '700' },
  condBadgeWarning: { borderColor: colors.hpWarning, backgroundColor: colors.hpWarning + '22' },
  condBadgeTextWarning: { fontSize: 12, color: colors.hpWarning, fontWeight: '700' },

  // HP block
  hpBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 20,
    marginBottom: 4,
    alignItems: 'center',
  },
  hpLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  hpRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  hpCurrent: { fontSize: 48, fontWeight: '700', lineHeight: 52 },
  hpSep: { fontSize: 24, color: colors.textSecondary },
  hpMax: { fontSize: 24, color: colors.textSecondary },
  hpTempBadge: { marginTop: 4, fontSize: 13, color: colors.hpWarning, fontWeight: '600' },
  hpTapHint: { marginTop: 6, fontSize: 11, color: colors.textSecondary },

  // HP bar
  hpBarTrack: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: 4,
    borderRadius: 2,
  },

  // Combat stat boxes
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  statLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Death saves
  deathSavesRow: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
  deathSaveSide: { alignItems: 'center', gap: 8 },
  deathSaveLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  savePips: { flexDirection: 'row', gap: 8 },
  savePip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
  },
  savePipSuccess: { backgroundColor: colors.hpHealthy, borderColor: colors.hpHealthy },
  savePipFailure: { backgroundColor: colors.hpDanger, borderColor: colors.hpDanger },
  deathSaveHint: { fontSize: 12, textAlign: 'center', marginTop: 10 },

  // Attribution
  attribution: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 8,
  },
});
