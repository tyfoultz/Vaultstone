// Level-up wizard. Reached from the character sheet's "Level up"
// button. Adapts its step list to the character's state:
//
//   • Class step       — only when multi-class is allowed AND the
//                        character has more than one valid choice
//                        (e.g. picking which class to level, or
//                        starting a new class entry).
//   • Subclass step    — only when leveling into the unlock level
//                        OR resolving a "subclass owed" slot left
//                        unfilled by the starting_level bootstrap.
//   • HP step          — always shown (max via fixed, or roll).
//   • ASI / Feat step  — only at ASI levels per isAsiLevel().
//   • Confirm          — always shown.
//
// Spell pick / spell slot rebalancing is deferred — applyLevelUp
// recomputes spell slot totals automatically; new known/prepared
// slots get filled via the sheet's spell tab. Surfacing a dedicated
// spell-pick step is its own arc.
//
// Apply happens in one batch on Confirm via applyLevelUp() + a single
// updateCharacter() write so the row goes from N to N+1 atomically.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import {
  getCharacterById,
  updateCharacter,
  getCampaignCharacterRules,
  resolveRuleValues,
} from '@vaultstone/api';
import { ContentResolver } from '@vaultstone/content';
import {
  BUNDLED_SYSTEMS_BY_ID,
  applyLevelUp,
  averageHpForDie,
  checkMulticlassPrereqs,
  classFeaturesAtLevel,
  conModifier,
  defaultHpGain,
  isAsiLevel,
  isSubclassUnlockLevel,
  unpackClassFeaturesForPick,
  type LevelUpPick,
} from '@vaultstone/systems';
import {
  Card, ContentWidth, GhostButton, GradientButton, Icon, MetaLabel,
  ScreenHeader, Text, colors, fonts, radius, spacing,
} from '@vaultstone/ui';
import {
  getClassEntries,
  getPrimaryClassEntry,
  type AbilityKey,
  type ClassResult,
  type Dnd5eAbilityScores,
  type Dnd5eClassEntry,
  type Dnd5eResources,
  type Dnd5eStats,
  type Json,
  type SubclassResult,
} from '@vaultstone/types';
import { useAuthStore } from '@vaultstone/store';

const ABILITIES: AbilityKey[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const ABILITY_SHORT: Record<AbilityKey, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

type StepKey = 'class' | 'subclass' | 'hp' | 'asi' | 'confirm';

type AsiKind = 'asi' | 'feat' | null;

export default function LevelUpScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);

  // ── Character + content load ──
  const [stats, setStats] = useState<Dnd5eStats | null>(null);
  const [resources, setResources] = useState<Dnd5eResources | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [packIds, setPackIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<ClassResult[]>([]);
  const [subclasses, setSubclasses] = useState<SubclassResult[]>([]);
  const [campaignRules, setCampaignRules] = useState<Record<string, boolean | string | number>>({});
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await getCharacterById(id);
      if (cancelled) return;
      if (error || !data) {
        setLoadError('Could not load character.');
        setLoading(false);
        return;
      }
      const baseStats = data.base_stats as unknown as Dnd5eStats;
      const baseResources = data.resources as unknown as Dnd5eResources;
      setStats(baseStats);
      setResources(baseResources);
      setCampaignId(data.campaign_id ?? null);
      setPackIds((data.pack_ids ?? []) as string[]);

      // Resolve campaign rules (multiclassing, enforce_feat_prerequisites).
      // Standalone characters fall through to the system defaults via the
      // resolveRuleValues fallback logic.
      if (data.campaign_id) {
        const sysId = baseStats.srdVersion === 'SRD_5.1' ? 'dnd5e_2014' : 'dnd5e_2024';
        const sys = BUNDLED_SYSTEMS_BY_ID[sysId];
        const { data: bag } = await getCampaignCharacterRules(data.campaign_id);
        if (sys && bag && !cancelled) {
          setCampaignRules(resolveRuleValues(sys.optionalRules, bag));
        }
      }

      // Resolve content. Always pull homebrew when there's a campaign or
      // an explicit pack opt-in; mirrors the wizard's scoping pattern.
      const includeHomebrew = !!data.campaign_id || (data.pack_ids ?? []).length > 0;
      const tiers: Array<'srd' | 'homebrew'> = includeHomebrew ? ['srd', 'homebrew'] : ['srd'];
      const tierArgs = {
        system: 'dnd5e' as const,
        srdVersion: baseStats.srdVersion,
        tiers,
        campaignId: data.campaign_id ?? undefined,
        packIds: !data.campaign_id && (data.pack_ids ?? []).length > 0 ? (data.pack_ids as string[]) : undefined,
      };
      const [clsResults, subResults] = await Promise.all([
        ContentResolver.search({ type: 'class', ...tierArgs }),
        ContentResolver.search({ type: 'subclass', ...tierArgs }),
      ]);
      if (cancelled) return;
      setClasses(clsResults as ClassResult[]);
      setSubclasses(subResults as SubclassResult[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (loadError || !stats || !resources) {
    return (
      <ScrollView contentContainerStyle={s.errorWrap}>
        <Text variant="title-md" family="headline" weight="bold">Could not load character</Text>
        <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.sm }}>
          {loadError || 'Try again from the character sheet.'}
        </Text>
        <View style={{ marginTop: spacing.lg }}>
          <GhostButton label="Back" onPress={() => router.back()} />
        </View>
      </ScrollView>
    );
  }

  return (
    <LevelUpFlow
      characterId={id!}
      stats={stats}
      resources={resources}
      campaignId={campaignId}
      packIds={packIds}
      classes={classes}
      subclasses={subclasses}
      campaignRules={campaignRules}
      onCancel={() => router.back()}
      onApplied={() => router.replace(`/character/${id}` as Href)}
    />
  );
}

// ── The wizard flow itself ──────────────────────────────────────────────

function LevelUpFlow({
  characterId,
  stats,
  resources,
  campaignId: _campaignId,
  packIds: _packIds,
  classes,
  subclasses,
  campaignRules,
  onCancel,
  onApplied,
}: {
  characterId: string;
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  campaignId: string | null;
  packIds: string[];
  classes: ClassResult[];
  subclasses: SubclassResult[];
  campaignRules: Record<string, boolean | string | number>;
  onCancel: () => void;
  onApplied: () => void;
}) {
  // Resolve campaign rules.
  const multiclassRule = (campaignRules.multiclassing as 'enforced' | 'relaxed' | 'disabled' | undefined) ?? 'enforced';

  const entries = getClassEntries(stats);
  const primary = getPrimaryClassEntry(stats);
  const totalLvl = entries.reduce((s, e) => s + e.level, 0);

  // ── Class pick: which class is leveling? ──
  // For single-class characters with multiclass disabled, this defaults
  // to the primary and the step is hidden. Otherwise the player picks
  // an existing class to advance OR starts a new multiclass entry.
  const [chosenClassKey, setChosenClassKey] = useState<string | null>(null);
  const [newClassKey, setNewClassKey] = useState<string | null>(null);
  const isMulticlassEntry = !!newClassKey;
  const effectiveClassKey = newClassKey ?? chosenClassKey ?? primary.classKey;

  const leveledClass = useMemo(
    () => classes.find((c) => c.key === effectiveClassKey) ?? null,
    [classes, effectiveClassKey],
  );

  // The level the leveling-class entry will end up at. New multiclass
  // entries always become level 1; existing entries increment.
  const newClassLevel: number = useMemo(() => {
    if (isMulticlassEntry) return 1;
    const e = entries.find((x) => x.classKey === effectiveClassKey);
    return e ? e.level + 1 : 1;
  }, [entries, effectiveClassKey, isMulticlassEntry]);

  // ── Subclass pick state ──
  const [chosenSubclassKey, setChosenSubclassKey] = useState<string | null>(null);

  // Determine whether the subclass step is needed. Two cases:
  //   1. The leveled class is hitting its subclass-unlock level for the
  //      first time on this character.
  //   2. The leveled class entry has subclassKey: null but the
  //      character is already past the unlock level (owed pick from a
  //      starting_level bootstrap).
  const showSubclassStep = useMemo(() => {
    if (!leveledClass || isMulticlassEntry) return false;
    if (isSubclassUnlockLevel(leveledClass, newClassLevel)) return true;
    const existing = entries.find((e) => e.classKey === effectiveClassKey);
    if (existing && !existing.subclassKey && newClassLevel >= leveledClass.subclassUnlockLevel) {
      return true;
    }
    return false;
  }, [leveledClass, newClassLevel, isMulticlassEntry, entries, effectiveClassKey]);

  // ── HP pick state ──
  const [hpMethod, setHpMethod] = useState<'fixed' | 'rolled'>(stats.settings?.hitPointMethod ?? 'fixed');
  const [hpRoll, setHpRoll] = useState<number | null>(null);

  // ── ASI / Feat pick state ──
  const showAsiStep = !!leveledClass && isAsiLevel(leveledClass, newClassLevel);
  const [asiKind, setAsiKind] = useState<AsiKind>(null);
  const [asiAllocation, setAsiAllocation] = useState<Record<AbilityKey, number>>(() => zeroAlloc());
  // Feat pick deferred to the existing FeatPickerModal — we record only
  // the chosen feat key + display data here, and surface a "Pick a feat"
  // button that opens the modal in a future polish pass. v1 supports
  // ASI only; the feat path stays as scaffolding.
  const [featPick, _setFeatPick] = useState<{ key: string; name: string; description: string } | null>(null);

  // ── Step orchestration ──
  // Class step is shown when the player can choose between leveling an
  // existing class OR starting a new one. With multiclass disabled and
  // a single class, the only choice is to level the primary — skip.
  const showClassStep = entries.length > 1 || multiclassRule !== 'disabled';

  const stepList: StepKey[] = useMemo(() => {
    const list: StepKey[] = [];
    if (showClassStep) list.push('class');
    if (showSubclassStep) list.push('subclass');
    list.push('hp');
    if (showAsiStep) list.push('asi');
    list.push('confirm');
    return list;
  }, [showClassStep, showSubclassStep, showAsiStep]);

  const [stepIdx, setStepIdx] = useState(0);
  // Default the chosen class to the primary on first mount when the
  // class step is shown, so the wizard has a reasonable starting state.
  useEffect(() => {
    if (showClassStep && !chosenClassKey && !newClassKey) {
      setChosenClassKey(primary.classKey);
    }
  }, [showClassStep, chosenClassKey, newClassKey, primary.classKey]);

  const stepKey = stepList[stepIdx];
  const isLastStep = stepIdx === stepList.length - 1;

  // ── Apply ──
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState('');

  function canAdvance(): boolean {
    switch (stepKey) {
      case 'class':    return !!effectiveClassKey;
      case 'subclass': return !!chosenSubclassKey;
      case 'hp':
        if (hpMethod === 'rolled' && (hpRoll === null || hpRoll < 1 || hpRoll > (leveledClass?.hitDie ?? 1))) return false;
        return true;
      case 'asi': {
        if (asiKind === null) return false;
        if (asiKind === 'feat') return !!featPick;
        const total = Object.values(asiAllocation).reduce((sum, n) => sum + n, 0);
        if (total !== 2) return false;
        // Each ability can only get +1 or +2 (not +3+); SRD allows +2 to
        // one OR +1 to two. Reject distributions outside that.
        const counts = Object.values(asiAllocation).filter((n) => n > 0);
        if (counts.some((n) => n > 2)) return false;
        return true;
      }
      case 'confirm':  return true;
      default:         return false;
    }
  }

  async function handleApply() {
    if (!leveledClass) return;
    setApplying(true);
    setApplyError('');

    const featuresAtLevel = classFeaturesAtLevel(leveledClass, newClassLevel);
    const hpGain = hpMethod === 'rolled' && hpRoll !== null
      ? defaultHpGain(stats, leveledClass, { rolledValue: hpRoll })
      : defaultHpGain(stats, leveledClass);

    const pick: LevelUpPick = {
      classKey: leveledClass.key,
      newMulticlassEntry: isMulticlassEntry,
      hpGain,
      classFeaturesUnlocked: unpackClassFeaturesForPick(featuresAtLevel),
      ...(showSubclassStep && chosenSubclassKey ? { subclassKey: chosenSubclassKey } : {}),
      ...(showAsiStep && asiKind === 'asi' ? {
        abilityScoreImprovement: nonZeroAlloc(asiAllocation),
      } : {}),
      ...(showAsiStep && asiKind === 'feat' && featPick ? {
        featKey: featPick.key,
        featData: { name: featPick.name, description: featPick.description },
      } : {}),
    };

    const classByKey = new Map(classes.map((c) => [c.key, c]));
    const result = applyLevelUp(
      { stats, resources },
      pick,
      leveledClass,
      classByKey,
    );

    const { error } = await updateCharacter(characterId, {
      base_stats: result.stats as unknown as Json,
      resources: result.resources as unknown as Json,
    });
    if (error) {
      setApplyError(error.message);
      setApplying(false);
      return;
    }
    onApplied();
  }

  // ── Render ──
  const headline =
    stepKey === 'class'    ? 'Choose a class to level' :
    stepKey === 'subclass' ? `Choose a ${leveledClass?.name ?? 'class'} subclass` :
    stepKey === 'hp'       ? 'Roll for Hit Points' :
    stepKey === 'asi'      ? 'Ability Score Improvement' :
    'Confirm level-up';

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <ContentWidth size="reading">
        <ScreenHeader
          title={headline}
          subtitle={`Level ${totalLvl} → ${totalLvl + 1}`}
          actions={(
            <GhostButton
              label="Cancel"
              onPress={onCancel}
            />
          )}
        />

        {applyError ? (
          <Text variant="body-sm" style={{ color: colors.hpDanger, marginBottom: spacing.sm }}>
            {applyError}
          </Text>
        ) : null}

        {stepKey === 'class' ? (
          <ClassPickStep
            entries={entries}
            classes={classes}
            stats={stats}
            multiclassRule={multiclassRule}
            chosenClassKey={chosenClassKey}
            newClassKey={newClassKey}
            onChooseExisting={(k) => { setNewClassKey(null); setChosenClassKey(k); setChosenSubclassKey(null); }}
            onChooseNew={(k) => { setChosenClassKey(null); setNewClassKey(k); setChosenSubclassKey(null); }}
          />
        ) : null}

        {stepKey === 'subclass' && leveledClass ? (
          <SubclassPickStep
            cls={leveledClass}
            subclasses={subclasses}
            chosen={chosenSubclassKey}
            onChoose={setChosenSubclassKey}
          />
        ) : null}

        {stepKey === 'hp' && leveledClass ? (
          <HpStep
            cls={leveledClass}
            stats={stats}
            method={hpMethod}
            onMethod={setHpMethod}
            roll={hpRoll}
            onRoll={setHpRoll}
          />
        ) : null}

        {stepKey === 'asi' && leveledClass ? (
          <AsiStep
            stats={stats}
            kind={asiKind}
            allocation={asiAllocation}
            onKind={setAsiKind}
            onAllocation={setAsiAllocation}
            featPick={featPick}
          />
        ) : null}

        {stepKey === 'confirm' && leveledClass ? (
          <ConfirmStep
            cls={leveledClass}
            newClassLevel={newClassLevel}
            isMulticlassEntry={isMulticlassEntry}
            stats={stats}
            hpMethod={hpMethod}
            hpRoll={hpRoll}
            asiKind={asiKind}
            asiAllocation={asiAllocation}
            chosenSubclassKey={chosenSubclassKey}
            subclasses={subclasses}
          />
        ) : null}

        <View style={s.footer}>
          <GhostButton
            label={stepIdx === 0 ? 'Cancel' : 'Back'}
            onPress={() => stepIdx === 0 ? onCancel() : setStepIdx(stepIdx - 1)}
          />
          {applying ? (
            <ActivityIndicator color={colors.primary} />
          ) : isLastStep ? (
            <GradientButton
              label="Apply level-up"
              onPress={handleApply}
              disabled={!canAdvance()}
            />
          ) : (
            <GradientButton
              label="Continue"
              onPress={() => setStepIdx(stepIdx + 1)}
              disabled={!canAdvance()}
            />
          )}
        </View>
      </ContentWidth>
    </ScrollView>
  );
}

// ── Step components ─────────────────────────────────────────────────────

function ClassPickStep({
  entries, classes, stats, multiclassRule, chosenClassKey, newClassKey,
  onChooseExisting, onChooseNew,
}: {
  entries: Dnd5eClassEntry[];
  classes: ClassResult[];
  stats: Dnd5eStats;
  multiclassRule: 'enforced' | 'relaxed' | 'disabled';
  chosenClassKey: string | null;
  newClassKey: string | null;
  onChooseExisting: (k: string) => void;
  onChooseNew: (k: string) => void;
}) {
  const allowMulticlass = multiclassRule !== 'disabled';
  const existing = entries.map((e) => ({
    entry: e,
    cls: classes.find((c) => c.key === e.classKey) ?? null,
  })).filter((x) => x.cls);

  // Candidate new classes: any class not already taken by an entry,
  // gated by multiclass prereq check using the campaign rule.
  const newCandidates = allowMulticlass
    ? classes
        .filter((c) => !entries.some((e) => e.classKey === c.key))
        .map((c) => ({
          cls: c,
          check: checkMulticlassPrereqs(stats.abilityScores, c, multiclassRule),
        }))
    : [];

  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="body-sm" tone="secondary">
        Pick the class to advance, or start a new one if you meet the multiclass prerequisites.
      </Text>

      <MetaLabel size="sm">Existing classes</MetaLabel>
      <View style={{ gap: spacing.sm }}>
        {existing.map(({ entry, cls }) => {
          const selected = !newClassKey && chosenClassKey === entry.classKey;
          return (
            <Pressable
              key={entry.classKey}
              onPress={() => cls && onChooseExisting(cls.key)}
              style={[s.classCard, selected && s.classCardSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="title-sm" family="headline" weight="bold">
                  {cls!.name}
                </Text>
                <Text variant="label-sm" tone="secondary">
                  Currently L{entry.level} → L{entry.level + 1}
                </Text>
              </View>
              {selected ? <Icon name="check" size={18} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </View>

      {allowMulticlass && newCandidates.length > 0 ? (
        <>
          <MetaLabel size="sm">Add a new class (multiclass)</MetaLabel>
          <Text variant="label-sm" tone="secondary">
            {multiclassRule === 'relaxed'
              ? 'Prerequisites are listed but not enforced in this campaign.'
              : 'You must meet each class\'s ability prerequisites.'}
          </Text>
          <View style={{ gap: spacing.sm }}>
            {newCandidates.map(({ cls, check }) => {
              const selected = newClassKey === cls.key;
              const locked = !check.ok;
              return (
                <Pressable
                  key={cls.key}
                  onPress={() => !locked && onChooseNew(cls.key)}
                  style={[s.classCard, selected && s.classCardSelected, locked && s.classCardLocked]}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="title-sm" family="headline" weight="bold">{cls.name}</Text>
                    <Text variant="label-sm" tone="secondary">
                      {cls.multiclassPrerequisite ?? 'No prerequisite'}
                    </Text>
                    {locked ? (
                      <Text variant="label-sm" style={{ color: colors.hpDanger, marginTop: 2 }}>
                        {check.reason}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? <Icon name="check" size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

function SubclassPickStep({
  cls, subclasses, chosen, onChoose,
}: {
  cls: ClassResult;
  subclasses: SubclassResult[];
  chosen: string | null;
  onChoose: (k: string) => void;
}) {
  // Filter subclasses to those targeting the leveling class. The
  // SubclassResult shape carries `parentClassKey` matching the class's
  // edition-suffixed key.
  const matching = subclasses.filter((sc) => sc.parentClassKey === cls.key);
  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="body-sm" tone="secondary">
        Pick a {cls.name} subclass. {matching.length} available.
      </Text>
      <View style={{ gap: spacing.sm }}>
        {matching.map((sc) => {
          const selected = chosen === sc.key;
          return (
            <Pressable
              key={sc.key}
              onPress={() => onChoose(sc.key)}
              style={[s.classCard, selected && s.classCardSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text variant="title-sm" family="headline" weight="bold">{sc.name}</Text>
                {sc.description ? (
                  <Text variant="label-sm" tone="secondary" numberOfLines={3}>
                    {sc.description}
                  </Text>
                ) : null}
              </View>
              {selected ? <Icon name="check" size={18} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
        {matching.length === 0 ? (
          <Text variant="body-sm" style={{ color: colors.hpDanger }}>
            No subclasses available for this class. (Pack may be missing subclasses.)
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function HpStep({
  cls, stats, method, onMethod, roll, onRoll,
}: {
  cls: ClassResult;
  stats: Dnd5eStats;
  method: 'fixed' | 'rolled';
  onMethod: (m: 'fixed' | 'rolled') => void;
  roll: number | null;
  onRoll: (n: number | null) => void;
}) {
  const conMod = conModifier(stats.abilityScores);
  const fixedGain = averageHpForDie(cls.hitDie) + conMod;
  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="body-sm" tone="secondary">
        Each level you gain HP from your class's hit die plus your CON modifier ({conMod >= 0 ? '+' : ''}{conMod}).
      </Text>
      <View style={s.segmented}>
        <Pressable
          onPress={() => onMethod('fixed')}
          style={[s.segment, method === 'fixed' && s.segmentSelected]}
        >
          <Text variant="label-md" weight="semibold" style={{ color: method === 'fixed' ? colors.primary : colors.onSurfaceVariant }}>
            Fixed (+{fixedGain})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onMethod('rolled')}
          style={[s.segment, method === 'rolled' && s.segmentSelected]}
        >
          <Text variant="label-md" weight="semibold" style={{ color: method === 'rolled' ? colors.primary : colors.onSurfaceVariant }}>
            Rolled (d{cls.hitDie})
          </Text>
        </Pressable>
      </View>
      {method === 'rolled' ? (
        <View>
          <MetaLabel size="sm">Roll result (1–{cls.hitDie})</MetaLabel>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.xs }}>
            <TextInput
              keyboardType="number-pad"
              style={s.numberInput}
              value={roll === null ? '' : String(roll)}
              onChangeText={(t) => {
                const n = parseInt(t, 10);
                if (!Number.isFinite(n)) onRoll(null);
                else onRoll(Math.max(1, Math.min(cls.hitDie, n)));
              }}
              placeholder="?"
              placeholderTextColor={colors.outline}
            />
            <GhostButton
              label="Auto-roll"
              onPress={() => onRoll(Math.floor(Math.random() * cls.hitDie) + 1)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function AsiStep({
  stats, kind, allocation, onKind, onAllocation, featPick,
}: {
  stats: Dnd5eStats;
  kind: AsiKind;
  allocation: Record<AbilityKey, number>;
  onKind: (k: AsiKind) => void;
  onAllocation: (a: Record<AbilityKey, number>) => void;
  featPick: { key: string; name: string; description: string } | null;
}) {
  function bump(ability: AbilityKey, delta: number) {
    const next = { ...allocation };
    const newVal = Math.max(0, Math.min(2, (next[ability] ?? 0) + delta));
    next[ability] = newVal;
    // Cap total to 2.
    const total = Object.values(next).reduce((sum, n) => sum + n, 0);
    if (total > 2) return;
    // Cap any single ability at +2.
    if (newVal > 2) return;
    onAllocation(next);
  }
  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="body-sm" tone="secondary">
        Choose either an Ability Score Improvement (+2 to one ability or +1 to two) or a feat.
      </Text>
      <View style={s.segmented}>
        <Pressable
          onPress={() => onKind('asi')}
          style={[s.segment, kind === 'asi' && s.segmentSelected]}
        >
          <Text variant="label-md" weight="semibold" style={{ color: kind === 'asi' ? colors.primary : colors.onSurfaceVariant }}>
            Ability Score Improvement
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onKind('feat')}
          style={[s.segment, kind === 'feat' && s.segmentSelected]}
        >
          <Text variant="label-md" weight="semibold" style={{ color: kind === 'feat' ? colors.primary : colors.onSurfaceVariant }}>
            Feat
          </Text>
        </Pressable>
      </View>

      {kind === 'asi' ? (
        <View style={{ gap: spacing.sm }}>
          {ABILITIES.map((ab) => {
            const cur = allocation[ab] ?? 0;
            const score = stats.abilityScores[ab];
            const newScore = score + cur;
            return (
              <View key={ab} style={s.asiRow}>
                <View style={s.asiBadge}>
                  <Text variant="label-md" weight="bold" style={{ color: colors.primary }}>{ABILITY_SHORT[ab]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body-sm" weight="semibold" style={{ textTransform: 'capitalize' }}>{ab}</Text>
                  <Text variant="label-sm" tone="secondary">
                    {score} → {newScore} (cap 20)
                  </Text>
                </View>
                <Pressable onPress={() => bump(ab, -1)} style={s.stepBtn} disabled={cur <= 0}>
                  <Text variant="title-sm" weight="bold">−</Text>
                </Pressable>
                <View style={s.allocPill}><Text variant="title-sm" weight="bold">+{cur}</Text></View>
                <Pressable onPress={() => bump(ab, 1)} style={s.stepBtn} disabled={cur >= 2 || score + cur >= 20}>
                  <Text variant="title-sm" weight="bold">+</Text>
                </Pressable>
              </View>
            );
          })}
          <Text variant="label-sm" tone="secondary" style={{ textAlign: 'center', marginTop: spacing.xs }}>
            Total assigned: {Object.values(allocation).reduce((s, n) => s + n, 0)} / 2
          </Text>
        </View>
      ) : kind === 'feat' ? (
        <View>
          <Text variant="body-sm" tone="secondary">
            Feat picker coming soon. For now, pick an ASI instead — you can swap to a feat after the level-up
            wizard supports it.
          </Text>
          {featPick ? (
            <View style={{ marginTop: spacing.sm }}>
              <Text variant="title-sm" family="headline" weight="bold">{featPick.name}</Text>
              <Text variant="body-sm" tone="secondary">{featPick.description}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ConfirmStep({
  cls, newClassLevel, isMulticlassEntry, stats, hpMethod, hpRoll,
  asiKind, asiAllocation, chosenSubclassKey, subclasses,
}: {
  cls: ClassResult;
  newClassLevel: number;
  isMulticlassEntry: boolean;
  stats: Dnd5eStats;
  hpMethod: 'fixed' | 'rolled';
  hpRoll: number | null;
  asiKind: AsiKind;
  asiAllocation: Record<AbilityKey, number>;
  chosenSubclassKey: string | null;
  subclasses: SubclassResult[];
}) {
  const conMod = conModifier(stats.abilityScores);
  const hpGain = hpMethod === 'rolled' && hpRoll !== null
    ? defaultHpGain(stats, cls, { rolledValue: hpRoll })
    : defaultHpGain(stats, cls);
  const features = classFeaturesAtLevel(cls, newClassLevel);
  const sub = chosenSubclassKey ? subclasses.find((s) => s.key === chosenSubclassKey) : null;

  return (
    <Card tier="container" padding="md" style={{ gap: spacing.sm }}>
      <Row label="Class">{isMulticlassEntry ? `${cls.name} (new class)` : `${cls.name} L${newClassLevel}`}</Row>
      {sub ? <Row label="Subclass">{sub.name}</Row> : null}
      <Row label="HP gain">{`+${hpGain}`} (d{cls.hitDie} {hpMethod === 'rolled' ? `rolled ${hpRoll ?? '?'}` : 'avg'} {conMod >= 0 ? '+' : ''}{conMod} CON)</Row>
      {asiKind === 'asi' ? (
        <Row label="Ability scores">
          {Object.entries(asiAllocation)
            .filter(([_, n]) => n > 0)
            .map(([k, n]) => `${ABILITY_SHORT[k as AbilityKey]} +${n}`)
            .join(', ') || '—'}
        </Row>
      ) : null}
      {features.length > 0 ? (
        <View style={{ marginTop: spacing.xs }}>
          <MetaLabel size="sm">New class features</MetaLabel>
          {features.map((f) => (
            <Text key={f.name} variant="body-sm" style={{ marginTop: 2 }}>
              <Text weight="bold">{f.name}.</Text> <Text tone="secondary">{f.description}</Text>
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
      <Text variant="label-sm" tone="secondary" style={{ width: 110 }}>{label}</Text>
      <Text variant="body-sm" weight="semibold" style={{ flex: 1 }}>{children}</Text>
    </View>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function zeroAlloc(): Record<AbilityKey, number> {
  return {
    strength: 0, dexterity: 0, constitution: 0,
    intelligence: 0, wisdom: 0, charisma: 0,
  };
}

function nonZeroAlloc(a: Record<AbilityKey, number>): Partial<Record<AbilityKey, number>> {
  const out: Partial<Record<AbilityKey, number>> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v > 0) out[k as AbilityKey] = v;
  }
  return out;
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.surfaceCanvas },
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorWrap: { padding: spacing.lg, alignItems: 'center' },
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainer,
  },
  classCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerHigh,
  },
  classCardLocked: {
    opacity: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    alignItems: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  numberInput: {
    width: 60,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    color: colors.onSurface,
    fontSize: 16,
    fontFamily: fonts.headline,
    textAlign: 'center',
  },
  asiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  asiBadge: {
    width: 40, height: 40,
    borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  stepBtn: {
    width: 32, height: 32,
    borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  allocPill: {
    minWidth: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainerHighest,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
});
