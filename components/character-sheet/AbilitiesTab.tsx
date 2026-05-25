import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type {
  Dnd5eStats,
  Dnd5eResources,
  Dnd5eFeature,
  Dnd5eClassEntry,
  ClassResult,
  SubclassResult,
  SpeciesResult,
  BackgroundResult,
  FeatResult,
} from '@vaultstone/types';
import { getClassEntries, normalizeStartingEquipmentItem } from '@vaultstone/types';

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  isOwner: boolean;
  // Live ContentResolver data — when present, the sheet renders class /
  // subclass / species / background features from these (the source of
  // truth) instead of the resources.classFeatures[] snapshot. The
  // resources arrays continue to surface as a "Custom" section so any
  // player-added entries don't get lost.
  classResultsByKey: Record<string, ClassResult>;
  subclassResultsByKey: Record<string, SubclassResult>;
  speciesResult: SpeciesResult | null;
  backgroundResult: BackgroundResult | null;
  originFeatResult: FeatResult | null;
  /** Catalog lookup for any feat the character has on
   *  `resources.feats`. The tab uses this to surface inline grant
   *  pickers (Skilled → pick 3 skills, etc.) when a feat's `grants`
   *  haven't been fully resolved yet. */
  featResultsByKey: Map<string, FeatResult>;
  /** Save per-feat picks back to the character. The host owns the
   *  merge into `stats.skillProficiencies` so the Skills tab reflects
   *  the new picks. */
  onSaveFeatPicks: (featKey: string, picks: { skills?: string[] }) => void;
  onToggleFeatureUse: (cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string, delta: number) => void;
  onAddFeature: (cat: 'classFeatures' | 'speciesTraits' | 'feats') => void;
  onEditFeature: (cat: 'classFeatures' | 'speciesTraits' | 'feats', feature: Dnd5eFeature) => void;
  onTraitChoice?: (traitName: string, optionName: string) => void;
  /** Add / remove a stable hide-key from resources.hiddenFeatures. Cards
   *  render dimmed and collapsed in place when their key is in the
   *  hidden set — no section movement. */
  onToggleHidden?: (key: string) => void;
}

const ACCENT_CLASS = colors.primary;
const ACCENT_SUBCLASS = '#a78bfa';
const ACCENT_SPECIES = colors.secondary;
const ACCENT_FEAT = `#e6a255`; // gm color
const ACCENT_BG = '#7dd3fc';

export function AbilitiesTab({
  stats, resources, isOwner,
  classResultsByKey, subclassResultsByKey, speciesResult, backgroundResult, originFeatResult,
  featResultsByKey, onSaveFeatPicks,
  onToggleFeatureUse, onAddFeature, onEditFeature, onTraitChoice, onToggleHidden,
}: Props) {
  const allCustomClassFeatures = resources.classFeatures ?? [];
  const allCustomSpeciesTraits = resources.speciesTraits ?? [];
  const feats = resources.feats ?? [];
  const entries = getClassEntries(stats);
  // Hide-key helpers. Live features have no persisted id, so the keys
  // derive from their source + name (slugified). Custom features get
  // prefixed by category so a homebrew "Sneak Attack" doesn't collide
  // with the catalog one. Cards stay in place when hidden — they
  // collapse to a single dimmed line with an Unhide button.
  const hiddenSet = useMemo(
    () => new Set(resources.hiddenFeatures ?? []),
    [resources.hiddenFeatures],
  );
  const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
  const liveKey = (kind: 'class' | 'subclass' | 'species' | 'origin-feat', subjectKey: string, name: string) =>
    `${kind}:${subjectKey}:${slug(name)}`.replace(/::/g, ':');
  const customKey = (cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string) =>
    `custom:${cat}:${id}`;

  // For each class entry, collect the live features from the resolved
  // ClassResult that the character has unlocked at their current level.
  // Sub-feature children (parentName !== undefined) render indented under
  // their parent — class data is already shipped sorted by level so we
  // preserve order.
  const classGroups = useMemo(() => {
    return entries
      .map((e) => {
        const cls = classResultsByKey[e.classKey];
        if (!cls) return null;
        const features = (cls.features ?? []).filter((f) => f.level <= e.level);
        return { entry: e, cls, features };
      })
      .filter((g): g is { entry: Dnd5eClassEntry; cls: ClassResult; features: NonNullable<ClassResult['features']> } => g !== null);
  }, [entries, classResultsByKey]);

  const subclassGroups = useMemo(() => {
    return entries
      .filter((e) => e.subclassKey)
      .map((e) => {
        const sub = subclassResultsByKey[e.subclassKey!];
        if (!sub) return null;
        const features = (sub.features ?? []).filter((f) => f.level <= e.level);
        return { entry: e, sub, features };
      })
      .filter((g): g is { entry: Dnd5eClassEntry; sub: SubclassResult; features: NonNullable<SubclassResult['features']> } => g !== null);
  }, [entries, subclassResultsByKey]);

  const resolvedClassFeatureNames = useMemo(() => {
    const names = new Set<string>();
    for (const g of classGroups) {
      for (const f of g.features) names.add(f.name.toLowerCase());
    }
    for (const g of subclassGroups) {
      for (const f of g.features) names.add(f.name.toLowerCase());
    }
    return names;
  }, [classGroups, subclassGroups]);

  const customClassFeatures = useMemo(
    () => allCustomClassFeatures.filter((f) => !resolvedClassFeatureNames.has(f.name.toLowerCase())),
    [allCustomClassFeatures, resolvedClassFeatureNames],
  );

  const resolvedSpeciesTraitNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of speciesResult?.traits ?? []) names.add(t.name.toLowerCase());
    return names;
  }, [speciesResult]);

  const customSpeciesTraits = useMemo(
    () => allCustomSpeciesTraits.filter((f) => !resolvedSpeciesTraitNames.has(f.name.toLowerCase())),
    [allCustomSpeciesTraits, resolvedSpeciesTraitNames],
  );

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* ── Class features (live from ContentResolver) ── */}
      <SectionRow label="CLASS FEATURES" accent={ACCENT_CLASS} />
      {classGroups.length === 0 && customClassFeatures.length === 0 && (
        <EmptyHint text="No class features yet — pick a class to unlock features at each level." />
      )}
      {classGroups.map(({ entry, cls, features }) => (
        <View key={`class-${entry.classKey}`}>
          {classGroups.length > 1 && (
            <Text style={s.groupSubhead}>{cls.name} · Level {entry.level}</Text>
          )}
          {features.length === 0 ? (
            <EmptyHint text={`No ${cls.name} features at this level yet.`} />
          ) : (
            features.map((f, i) => {
              const k = liveKey('class', entry.classKey, f.name);
              return (
                <ContentFeatureCard
                  key={`class-${entry.classKey}-${i}-${f.name}`}
                  name={f.name}
                  description={f.description ?? ''}
                  level={f.level}
                  accent={ACCENT_CLASS}
                  indented={!!f.parentName}
                  hidden={hiddenSet.has(k)}
                  onToggleHidden={isOwner && onToggleHidden ? () => onToggleHidden(k) : undefined}
                />
              );
            })
          )}
        </View>
      ))}

      {/* Custom class features the player added by hand. Kept distinct so
          they don't disappear if the resolver hasn't returned yet, and so
          homebrew authors can layer extra entries on top of catalog ones. */}
      {customClassFeatures.length > 0 && (
        <>
          <SectionSubRow label="CUSTOM" accent={ACCENT_CLASS} onAdd={isOwner ? () => onAddFeature('classFeatures') : undefined} />
          {customClassFeatures.map((f) => {
            const k = customKey('classFeatures', f.id);
            return (
              <FeatureCard
                key={f.id}
                feature={f}
                accent={ACCENT_CLASS}
                canEdit={isOwner}
                onEdit={() => onEditFeature('classFeatures', f)}
                onUse={(delta) => onToggleFeatureUse('classFeatures', f.id, delta)}
                hidden={hiddenSet.has(k)}
                onToggleHidden={isOwner && onToggleHidden ? () => onToggleHidden(k) : undefined}
              />
            );
          })}
        </>
      )}
      {customClassFeatures.length === 0 && isOwner && (
        <View style={s.addCustomRow}>
          <TouchableOpacity onPress={() => onAddFeature('classFeatures')} activeOpacity={0.7} style={s.addCustomBtn}>
            <MaterialCommunityIcons name="plus" size={12} color={ACCENT_CLASS} />
            <Text style={[s.addCustomText, { color: ACCENT_CLASS }]}>Add custom feature</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Subclass features (live from ContentResolver) ── */}
      {subclassGroups.length > 0 && (
        <>
          <SectionRow label="SUBCLASS FEATURES" accent={ACCENT_SUBCLASS} style={{ marginTop: 16 }} />
          {subclassGroups.map(({ entry, sub, features }) => (
            <View key={`sub-${entry.subclassKey}`}>
              {subclassGroups.length > 1 && (
                <Text style={s.groupSubhead}>{sub.name}</Text>
              )}
              {features.length === 0 ? (
                <EmptyHint text={`No ${sub.name} features at this level yet.`} />
              ) : (
                features.map((f, i) => {
                  const k = liveKey('subclass', entry.subclassKey ?? '', f.name);
                  return (
                    <ContentFeatureCard
                      key={`sub-${entry.subclassKey}-${i}-${f.name}`}
                      name={f.name}
                      description={f.description}
                      level={f.level}
                      accent={ACCENT_SUBCLASS}
                      hidden={hiddenSet.has(k)}
                      onToggleHidden={isOwner && onToggleHidden ? () => onToggleHidden(k) : undefined}
                    />
                  );
                })
              )}
            </View>
          ))}
        </>
      )}

      {/* ── Background ── */}
      {(backgroundResult || stats.originFeat) && (
        <SectionRow label="BACKGROUND" accent={ACCENT_BG} style={{ marginTop: 16 }} />
      )}
      {backgroundResult && (
        <View style={s.bgCard}>
          <Text style={s.bgName}>{backgroundResult.name}</Text>
          {backgroundResult.skillProficiencies.length > 0 && (
            <Text style={s.bgMeta}>Skills: {backgroundResult.skillProficiencies.join(', ')}</Text>
          )}
          {backgroundResult.toolProficiency && (
            <Text style={s.bgMeta}>Tool: {backgroundResult.toolProficiency}</Text>
          )}
          {backgroundResult.languages > 0 && (
            <Text style={s.bgMeta}>Languages: +{backgroundResult.languages}</Text>
          )}
          {Array.isArray(backgroundResult.startingEquipment) && backgroundResult.startingEquipment.length > 0 ? (
            <Text style={s.bgEquip}>
              {backgroundResult.startingEquipment
                .map((opt) => {
                  const parts: string[] = [];
                  if (opt.items && opt.items.length > 0) {
                    parts.push(opt.items.map((i) => {
                      const n = normalizeStartingEquipmentItem(i);
                      return n.qty && n.qty > 1 ? `${n.qty} × ${n.name}` : n.name;
                    }).join(', '));
                  }
                  if (opt.gold) {
                    if (opt.gold.dice) {
                      parts.push(`${opt.gold.dice} ${opt.gold.currency}`);
                    } else if (typeof opt.gold.amount === 'number') {
                      parts.push(`${opt.gold.amount} ${opt.gold.currency}`);
                    }
                  }
                  const inner = parts.join(' + ');
                  return opt.label ? `${opt.label}: ${inner}` : inner;
                })
                .filter(Boolean)
                .join('  /  ')}
            </Text>
          ) : backgroundResult.startingEquipmentText ? (
            // Legacy freeform string from older imports that predate
            // the structured shape. Render as-is.
            <Text style={s.bgEquip}>{backgroundResult.startingEquipmentText}</Text>
          ) : null}
        </View>
      )}

      {/* Origin feat: prefer the resolved FeatResult (full description +
          structured benefits) over the bare name we used to show. */}
      {originFeatResult ? (() => {
        const k = liveKey('origin-feat', '', originFeatResult.name);
        return (
          <ContentFeatureCard
            name={originFeatResult.name}
            description={[
              originFeatResult.description ?? '',
              ...(originFeatResult.benefits ?? []).map((b) => `• ${b}`),
            ].filter(Boolean).join('\n\n')}
            subtitle="Origin feat"
            accent={ACCENT_FEAT}
            hidden={hiddenSet.has(k)}
            onToggleHidden={isOwner && onToggleHidden ? () => onToggleHidden(k) : undefined}
          />
        );
      })() : stats.originFeat ? (() => {
        const k = liveKey('origin-feat', '', stats.originFeat);
        return (
          <ContentFeatureCard
            name={stats.originFeat}
            subtitle="Origin feat"
            accent={ACCENT_FEAT}
            description="This feat was granted by your background at character creation."
            hidden={hiddenSet.has(k)}
            onToggleHidden={isOwner && onToggleHidden ? () => onToggleHidden(k) : undefined}
          />
        );
      })() : null}

      {/* ── Species traits (live from ContentResolver) ── */}
      <SectionRow label="SPECIES TRAITS" accent={ACCENT_SPECIES} style={{ marginTop: 16 }} />
      {speciesResult && (speciesResult.traits ?? []).length > 0 ? (
        speciesResult.traits.map((t, i) => {
          const k = liveKey('species', '', t.name);
          return (
            <ContentFeatureCard
              key={`species-${i}-${t.name}`}
              name={t.name}
              description={t.description}
              accent={ACCENT_SPECIES}
              level={t.level}
              options={t.options}
              selectedOption={stats.traitChoices?.[t.name]}
              onPickOption={isOwner && onTraitChoice ? (opt) => onTraitChoice(t.name, opt) : undefined}
              hidden={hiddenSet.has(k)}
              onToggleHidden={isOwner && onToggleHidden ? () => onToggleHidden(k) : undefined}
            />
          );
        })
      ) : !speciesResult ? (
        <EmptyHint text="Resolving species traits…" />
      ) : (
        <EmptyHint text="No species traits in this entry." />
      )}

      {/* Custom species traits the player added. */}
      {customSpeciesTraits.length > 0 && (
        <>
          <SectionSubRow label="CUSTOM" accent={ACCENT_SPECIES} onAdd={isOwner ? () => onAddFeature('speciesTraits') : undefined} />
          {customSpeciesTraits.map((f) => {
            const k = customKey('speciesTraits', f.id);
            return (
              <FeatureCard
                key={f.id}
                feature={f}
                accent={ACCENT_SPECIES}
                canEdit={isOwner}
                onEdit={() => onEditFeature('speciesTraits', f)}
                onUse={(delta) => onToggleFeatureUse('speciesTraits', f.id, delta)}
                hidden={hiddenSet.has(k)}
                onToggleHidden={isOwner && onToggleHidden ? () => onToggleHidden(k) : undefined}
              />
            );
          })}
        </>
      )}
      {customSpeciesTraits.length === 0 && isOwner && (
        <View style={s.addCustomRow}>
          <TouchableOpacity onPress={() => onAddFeature('speciesTraits')} activeOpacity={0.7} style={s.addCustomBtn}>
            <MaterialCommunityIcons name="plus" size={12} color={ACCENT_SPECIES} />
            <Text style={[s.addCustomText, { color: ACCENT_SPECIES }]}>Add custom trait</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Feats ── */}
      <SectionRow
        label="FEATS"
        accent={ACCENT_FEAT}
        style={{ marginTop: 16 }}
        onAdd={isOwner ? () => onAddFeature('feats') : undefined}
      />
      {feats.length === 0 ? (
        <EmptyHint text="No feats added yet." />
      ) : (
        feats.map((f) => {
          const featResult = featResultsByKey.get(f.id);
          const skillGrant = featResult?.grants?.skills;
          const picks = resources.featPicks?.[f.id]?.skills ?? [];
          const showGrantPicker = !!skillGrant && isOwner;
          // Skills the character already has from other sources — used
          // to disable duplicate-prof chips in the picker. We strip
          // *this feat's own picks* first so deselecting one doesn't
          // immediately re-disable it.
          const otherProfs = new Set(
            (stats.skillProficiencies ?? [])
              .map((sk) => sk.toLowerCase())
              .filter((sk) => !picks.map((p) => p.toLowerCase()).includes(sk)),
          );
          const k = customKey('feats', f.id);
          return (
            <View key={f.id}>
              <FeatureCard
                feature={f}
                accent={ACCENT_FEAT}
                canEdit={isOwner}
                onEdit={() => onEditFeature('feats', f)}
                onUse={(delta) => onToggleFeatureUse('feats', f.id, delta)}
                hidden={hiddenSet.has(k)}
                onToggleHidden={isOwner && onToggleHidden ? () => onToggleHidden(k) : undefined}
              />
              {showGrantPicker ? (
                <FeatGrantPicker
                  featKey={f.id}
                  grant={skillGrant!}
                  picked={picks}
                  existingProfs={otherProfs}
                  onChange={(next) => onSaveFeatPicks(f.id, { ...resources.featPicks?.[f.id], skills: next })}
                />
              ) : null}
            </View>
          );
        })
      )}

      {/* ── Proficiencies (live from class + background, with attribution) ── */}
      <SectionRow label="PROFICIENCIES" style={{ marginTop: 16 }} />
      <View style={s.profCard}>
        <ProfLineWithSources
          label="Armor"
          items={mergeProfsWithSources({
            stored: stats.armorProficiencies,
            classGroups: classGroups.map((g) => ({ source: g.cls.name, items: g.cls.armorProficiencies })),
          })}
        />
        <ProfLineWithSources
          label="Weapons"
          items={mergeProfsWithSources({
            stored: stats.weaponProficiencies,
            classGroups: classGroups.map((g) => ({ source: g.cls.name, items: g.cls.weaponProficiencies })),
          })}
        />
        <ProfLineWithSources
          label="Tools"
          items={mergeProfsWithSources({
            stored: stats.toolProficiencies,
            classGroups: classGroups.map((g) => ({ source: g.cls.name, items: g.cls.toolProficiencies ?? [] })),
            background: backgroundResult?.toolProficiency
              ? { source: backgroundResult.name, items: [backgroundResult.toolProficiency] }
              : null,
          })}
        />
        <ProfLineWithSources
          label="Saving Throws"
          items={mergeProfsWithSources({
            stored: stats.savingThrowProficiencies.map((s) => capitalize(s)),
            classGroups: classGroups
              .filter((g) => g.entry.primary)
              .map((g) => ({ source: g.cls.name, items: g.cls.savingThrows.map((s) => capitalize(s)) })),
          })}
        />
        <ProfLineWithSources
          label="Skills"
          items={mergeProfsWithSources({
            stored: stats.skillProficiencies.map((s) => titleCase(s)),
            background: backgroundResult
              ? { source: backgroundResult.name, items: backgroundResult.skillProficiencies.map((s) => titleCase(s)) }
              : null,
          })}
        />
        <ProfLineWithSources
          label="Languages"
          items={mergeProfsWithSources({
            stored: stats.languages,
            background: backgroundResult && backgroundResult.languages > 0
              ? { source: backgroundResult.name, items: [`+${backgroundResult.languages} of player choice`] }
              : null,
          })}
        />
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

function SectionRow({ label, accent, style, onAdd }: {
  label: string; accent?: string; style?: any; onAdd?: () => void;
}) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={[s.sectionLabel, accent && { color: accent }]}>{label}</Text>
      <View style={[s.sectionLine, accent && { backgroundColor: `${accent}44` }]} />
      {onAdd && (
        <TouchableOpacity onPress={onAdd} style={s.addBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="plus" size={14} color={accent ?? colors.outline} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Lighter heading rule for the "Custom" subsection inside a section group.
function SectionSubRow({ label, accent, onAdd }: {
  label: string; accent: string; onAdd?: () => void;
}) {
  return (
    <View style={s.subRow}>
      <Text style={[s.subRowLabel, { color: accent }]}>{label}</Text>
      <View style={[s.subRowLine, { backgroundColor: `${accent}22` }]} />
      {onAdd && (
        <TouchableOpacity onPress={onAdd} hitSlop={8} activeOpacity={0.7}>
          <MaterialCommunityIcons name="plus" size={12} color={accent} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// Read-only feature card driven by ContentResolver data. No edit / use
// affordances — the source is the catalog entry, not player state.
function ContentFeatureCard({ name, description, accent, level, subtitle, indented, options, selectedOption, onPickOption, hidden, onToggleHidden }: {
  name: string;
  description?: string;
  accent: string;
  level?: number;
  subtitle?: string;
  indented?: boolean;
  options?: Array<{ name: string; description: string }>;
  selectedOption?: string;
  onPickOption?: (optionName: string) => void;
  /** When true, the card renders collapsed and dimmed with an Unhide
   *  affordance — no expand chevron, no description body. */
  hidden?: boolean;
  /** Flip this feature's hide state. Undefined → no hide button shown. */
  onToggleHidden?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showAllOptions, setShowAllOptions] = useState(false);
  const hasOptions = Array.isArray(options) && options.length > 0;
  const selectedEntry = hasOptions ? options.find((o) => o.name === selectedOption) : null;
  if (hidden) {
    return (
      <View style={[s.featureCard, indented && s.featureCardIndent, s.featureCardHidden]}>
        <View style={s.featureHeader}>
          <View style={[s.accentBar, { backgroundColor: accent, opacity: 0.4 }]} />
          <View style={s.featureHeaderBody}>
            <View style={s.featureTitleRow}>
              <Text style={[s.featureName, s.featureNameHidden]} numberOfLines={1}>{name}</Text>
              {onToggleHidden ? (
                <TouchableOpacity onPress={onToggleHidden} hitSlop={8} activeOpacity={0.7}>
                  <Text style={[s.hiddenUnhideText, { color: accent }]}>Unhide</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    );
  }
  const metaText = selectedOption
    ? selectedOption
    : subtitle ?? (level ? `Level ${level}` : null);
  return (
    <View style={[s.featureCard, indented && s.featureCardIndent]}>
      <TouchableOpacity style={s.featureHeader} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <View style={[s.accentBar, { backgroundColor: accent }]} />
        <View style={s.featureHeaderBody}>
          <View style={s.featureTitleRow}>
            <Text style={s.featureName} numberOfLines={1}>{name}</Text>
            {metaText ? (
              <Text style={s.featureUses} numberOfLines={1}>{metaText}</Text>
            ) : null}
            {onToggleHidden ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); onToggleHidden(); }}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="eye-off-outline" size={13} color={colors.outline} />
              </TouchableOpacity>
            ) : null}
            <MaterialCommunityIcons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.outline}
            />
          </View>
        </View>
      </TouchableOpacity>
      {open ? (
        <View style={s.featureBody}>
          {description ? <Text style={s.featureDesc}>{description}</Text> : null}
          {hasOptions ? (
            <View style={s.traitOptionsBlock}>
              {selectedEntry && !showAllOptions ? (
                <>
                  <View style={[s.traitOption, s.traitOptionSelected]}>
                    <View style={s.traitOptionHeader}>
                      <MaterialCommunityIcons name="radiobox-marked" size={16} color={accent} />
                      <Text style={[s.traitOptionName, { color: accent }]}>{selectedEntry.name}</Text>
                    </View>
                    {selectedEntry.description ? (
                      <Text style={s.traitOptionDesc}>{selectedEntry.description}</Text>
                    ) : null}
                  </View>
                  {onPickOption ? (
                    <TouchableOpacity onPress={() => setShowAllOptions(true)} activeOpacity={0.7}>
                      <Text style={[s.traitOptionsLabel, { color: colors.outline, marginTop: 4 }]}>
                        Show all options ›
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={s.traitOptionsLabel}>
                    {selectedOption ? 'Pick one:' : 'Pick one:'}
                  </Text>
                  {options.map((opt) => {
                    const isSelected = selectedOption === opt.name;
                    return (
                      <TouchableOpacity
                        key={opt.name}
                        style={[s.traitOption, isSelected && s.traitOptionSelected]}
                        onPress={() => {
                          onPickOption?.(opt.name);
                          setShowAllOptions(false);
                        }}
                        disabled={!onPickOption}
                        activeOpacity={0.7}
                      >
                        <View style={s.traitOptionHeader}>
                          <MaterialCommunityIcons
                            name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                            size={16}
                            color={isSelected ? accent : colors.outline}
                          />
                          <Text style={[s.traitOptionName, isSelected && { color: accent }]}>
                            {opt.name}
                          </Text>
                        </View>
                        {opt.description ? (
                          <Text style={s.traitOptionDesc}>{opt.description}</Text>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function FeatureCard({ feature, accent, canEdit, onEdit, onUse, hidden, onToggleHidden }: {
  feature: Dnd5eFeature;
  accent: string;
  canEdit: boolean;
  onEdit: () => void;
  onUse: (delta: number) => void;
  hidden?: boolean;
  onToggleHidden?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (hidden) {
    return (
      <View style={[s.featureCard, s.featureCardHidden]}>
        <View style={s.featureHeader}>
          <View style={[s.accentBar, { backgroundColor: accent, opacity: 0.4 }]} />
          <View style={s.featureHeaderBody}>
            <View style={s.featureTitleRow}>
              <Text style={[s.featureName, s.featureNameHidden]} numberOfLines={1}>{feature.name}</Text>
              {onToggleHidden ? (
                <TouchableOpacity onPress={onToggleHidden} hitSlop={8} activeOpacity={0.7}>
                  <Text style={[s.hiddenUnhideText, { color: accent }]}>Unhide</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    );
  }
  return (
    <View style={s.featureCard}>
      <TouchableOpacity style={s.featureHeader} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <View style={[s.accentBar, { backgroundColor: accent }]} />
        <View style={s.featureHeaderBody}>
          <View style={s.featureTitleRow}>
            <Text style={s.featureName} numberOfLines={1}>{feature.name}</Text>
            {feature.uses ? (
              <Text style={s.featureUses}>
                {feature.uses.current}/{feature.uses.max} · {feature.uses.recharge}
              </Text>
            ) : null}
            {canEdit ? (
              <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); onEdit(); }} hitSlop={8}>
                <MaterialCommunityIcons name="pencil-outline" size={13} color={colors.outline} />
              </TouchableOpacity>
            ) : null}
            {onToggleHidden ? (
              <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); onToggleHidden(); }}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="eye-off-outline" size={13} color={colors.outline} />
              </TouchableOpacity>
            ) : null}
            <MaterialCommunityIcons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.outline}
            />
          </View>
        </View>
      </TouchableOpacity>
      {open && (
        <View style={s.featureBody}>
          {feature.description ? (
            <Text style={s.featureDesc}>{feature.description}</Text>
          ) : null}
          {feature.notes ? (
            <View style={s.featureNotesBox}>
              <Text style={s.featureNotesLabel}>NOTES</Text>
              <Text style={s.featureNotesText}>{feature.notes}</Text>
            </View>
          ) : null}
          {feature.uses && (
            <View style={s.usesRow}>
              <View style={s.pipsRow}>
                {Array.from({ length: feature.uses.max }).map((_, i) => (
                  <View
                    key={i}
                    style={[s.pip, i < feature.uses!.current && { backgroundColor: accent, borderColor: accent }]}
                  />
                ))}
              </View>
              <View style={s.usesBtns}>
                <TouchableOpacity
                  style={s.usesBtn}
                  onPress={() => onUse(-1)}
                  disabled={feature.uses.current <= 0}
                  activeOpacity={0.7}
                >
                  <Text style={s.usesBtnText}>Use</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.usesBtn}
                  onPress={() => onUse(feature.uses!.max - feature.uses!.current)}
                  disabled={feature.uses.current >= feature.uses.max}
                  activeOpacity={0.7}
                >
                  <Text style={s.usesBtnText}>Restore</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <View style={s.emptyHint}>
      <Text style={s.emptyHintText}>{text}</Text>
    </View>
  );
}

// Merge proficiency entries from class(es), background, and the
// stored stats array so the sheet can show "Smith's Tools (Soldier)"
// — keyed by the lower-cased name to dedupe across sources. Stored
// entries that aren't derivable from any source surface as
// "Custom" (player-added or set by another tool).
type ProfWithSource = { name: string; sources: string[] };
function mergeProfsWithSources(args: {
  stored: string[];
  classGroups?: Array<{ source: string; items: string[] }>;
  background?: { source: string; items: string[] } | null;
}): ProfWithSource[] {
  const map = new Map<string, ProfWithSource>();
  const addOne = (name: string, source: string) => {
    const key = name.trim().toLowerCase();
    if (!key) return;
    const existing = map.get(key);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      map.set(key, { name: name.trim(), sources: [source] });
    }
  };
  for (const group of args.classGroups ?? []) {
    for (const item of group.items) addOne(item, group.source);
  }
  if (args.background) {
    for (const item of args.background.items) addOne(item, args.background.source);
  }
  // Anything in stored that didn't come from a derived source is a
  // custom / player-added entry. We only flag it as "Custom" when no
  // other source already claimed the same name (case-insensitive).
  for (const item of args.stored) {
    const key = item.trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { name: item.trim(), sources: ['Custom'] });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function ProfLineWithSources({ label, items }: { label: string; items: ProfWithSource[] }) {
  if (items.length === 0) return null;
  return (
    <View style={s.profLine}>
      <Text style={s.profLineLabel}>{label}</Text>
      <View style={s.profItemsWrap}>
        {items.map((it, i) => (
          <View key={`${it.name}-${i}`} style={s.profItem}>
            <Text style={s.profItemName}>{it.name}</Text>
            <Text style={s.profItemSrc}>{it.sources.join(' · ')}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
function titleCase(s: string) { return s.split(/\s+/).map(capitalize).join(' '); }

// Canonical 5e skill list — fallback when a feat grants
// `skills.from: 'any'` (e.g. Skilled). Mirrors the StepFeats list so
// the chip picker behaves the same on the wizard + sheet.
const ALL_SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
];

/**
 * Inline picker for a feat's `grants.skills` clause. Surfaced on the
 * Traits tab under the feat card so players can resolve / change the
 * picks after creation. Identical chip semantics to StepFeats — N max,
 * disabled when the cap is hit, toggle to deselect. Saves call up to
 * the host which mirrors picks into `stats.skillProficiencies`.
 */
function FeatGrantPicker({
  featKey,
  grant,
  picked,
  existingProfs,
  onChange,
}: {
  featKey: string;
  grant: { count: number; from: string[] | 'any' };
  picked: string[];
  /** Lowercased skill names the character already has from other
   *  sources (class / background / other feats). These chips render
   *  disabled with an "Already proficient" label per SRD: "If you
   *  gain a skill proficiency you already have, you can choose a
   *  different one." */
  existingProfs: Set<string>;
  onChange: (next: string[]) => void;
}) {
  const options = grant.from === 'any' ? ALL_SKILLS : grant.from;
  const target = grant.count;
  function toggle(skill: string) {
    const has = picked.includes(skill);
    if (has) {
      onChange(picked.filter((s) => s !== skill));
      return;
    }
    if (picked.length >= target) return;
    onChange([...picked, skill]);
  }
  const remaining = Math.max(0, target - picked.length);
  return (
    <View style={s.grantPicker}>
      <Text style={s.grantPickerLabel}>
        {remaining > 0
          ? `Pick ${remaining} more skill${remaining === 1 ? '' : 's'} (${picked.length}/${target})`
          : `${target} skill${target === 1 ? '' : 's'} picked`}
      </Text>
      <View style={s.grantPickerChips}>
        {options.map((skill) => {
          const isPicked = picked.includes(skill);
          const isExisting = existingProfs.has(skill.toLowerCase());
          const capped = picked.length >= target && !isPicked;
          // Existing-prof takes precedence — show the "already proficient"
          // chip even when at cap. capped-disabled stays a separate state
          // (gray, no subtitle) so players can tell the cap from the dupe.
          const disabled = isExisting || capped;
          return (
            <View key={skill} style={{ alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => toggle(skill)}
                disabled={disabled}
                style={[
                  s.grantChip,
                  isPicked && s.grantChipPicked,
                  isExisting && s.grantChipExisting,
                  capped && !isExisting && s.grantChipDisabled,
                ]}
              >
                <Text
                  style={[
                    s.grantChipText,
                    isPicked && s.grantChipTextPicked,
                    isExisting && s.grantChipTextExisting,
                  ]}
                >
                  {skill}
                </Text>
              </TouchableOpacity>
              {isExisting ? (
                <Text style={s.grantChipExistingHint}>Already proficient</Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: 14 },

  // Feat grant picker (Skilled "pick 3 skills" etc.) — slotted under
  // the feat card. Compact, no border (the parent card carries the
  // visual frame) so the picker reads as a continuation of the feat.
  grantPicker: {
    marginTop: -6, marginBottom: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLow,
    borderLeftWidth: 3,
    borderLeftColor: '#e6a25566', // ACCENT_FEAT @ 40% opacity
  },
  grantPickerLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase',
    color: colors.onSurfaceVariant, marginBottom: 6,
  },
  grantPickerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  grantChip: {
    paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  grantChipPicked: { backgroundColor: colors.primary, borderColor: colors.primary },
  grantChipDisabled: { opacity: 0.35 },
  // "Already proficient" — distinct from capped-disabled (a dimmer
  // grayscale) so the player can tell which chips are off-limits because
  // they'd duplicate an existing prof.
  grantChipExisting: {
    backgroundColor: colors.surfaceContainerLow,
    borderColor: colors.outlineVariant,
    opacity: 0.5,
  },
  grantChipText: { fontSize: 11, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  grantChipTextPicked: { color: colors.onPrimary },
  grantChipTextExisting: {
    color: colors.outline,
    textDecorationLine: 'line-through',
  },
  grantChipExistingHint: {
    fontSize: 9, fontFamily: fonts.label,
    color: colors.outline,
    marginTop: 2, letterSpacing: 0.3,
  },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },
  addBtn: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },

  subRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, marginTop: 4 },
  subRowLabel: { fontSize: 8, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  subRowLine: { flex: 1, height: StyleSheet.hairlineWidth },

  groupSubhead: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    color: colors.onSurfaceVariant, marginTop: 4, marginBottom: 6,
  },

  addCustomRow: { paddingVertical: 4, marginBottom: 4 },
  addCustomBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  addCustomText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 0.5 },

  // Feature card chassis — mirrors the Combat/Spells equipCard pattern:
  // transparent fill, thin outline, full-height 2px accent bar, compact
  // body. The two card variants (ContentFeatureCard for catalog
  // features + FeatureCard for tracked-use custom entries) both use
  // these styles for cross-tab visual cohesion.
  featureCard: {
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 6, overflow: 'hidden', marginBottom: 4,
  },
  featureCardIndent: { marginLeft: 16 },
  featureHeader: { flexDirection: 'row', alignItems: 'stretch' },
  /** Full-height accent bar — width 2 matches the spell + ability cards. */
  accentBar: { width: 2, alignSelf: 'stretch' },
  /** Padded body wrapper inside the header row — owns the title row +
   *  meta sub line. Padding here (instead of on featureHeader) lets the
   *  bar stretch the full row height. */
  featureHeaderBody: { flex: 1, paddingHorizontal: 8, paddingVertical: 5, gap: 1 },
  featureTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureName: {
    flex: 1, fontSize: 12, fontFamily: fonts.headline, fontWeight: '600',
    color: colors.onSurface, letterSpacing: -0.1,
  },
  featureCardHidden: { opacity: 0.55 },
  featureNameHidden: {
    fontWeight: '500',
    color: colors.onSurfaceVariant,
    textDecorationLine: 'line-through',
  },
  hiddenUnhideText: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.4,
  },
  featureUses: { fontSize: 10, color: colors.outline },
  /** Expanded body — inset 10px on the left so description text aligns
   *  with the spell name above (which sits past the 2px bar + 8px body
   *  padding). Bottom padding keeps the description from kissing the
   *  card border. */
  featureBody: {
    paddingHorizontal: 10, paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  featureDesc: {
    fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 15, marginTop: 8,
  },
  featureNotesBox: {
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: radius.lg,
    borderLeftWidth: 2, borderLeftColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  featureNotesLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, color: colors.primary, marginBottom: 4,
  },
  featureNotesText: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurface,
    lineHeight: 18, fontStyle: 'italic',
  },

  usesRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pipsRow: { flexDirection: 'row', gap: 5 },
  pip: {
    width: 14, height: 14, borderRadius: 3,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  usesBtns: { flexDirection: 'row', gap: 6 },
  usesBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  usesBtnText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '600', color: colors.onSurfaceVariant },

  emptyHint: {
    paddingVertical: 10, paddingHorizontal: 2, marginBottom: 4,
  },
  emptyHintText: { fontSize: 12, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic' },

  bgCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 12, marginBottom: 8,
  },
  bgName: { fontSize: 13, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface, marginBottom: 4 },
  bgMeta: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 16 },
  bgEquip: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, marginTop: 6, fontStyle: 'italic' },

  profCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 14,
  },
  profLine: { marginBottom: 12 },
  profLineLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
    marginBottom: 4,
  },
  profLineValue: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  profItemsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  profItem: {
    backgroundColor: colors.surfaceContainerHighest,
    borderRadius: radius.lg,
    paddingVertical: 4, paddingHorizontal: 8,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  profItemName: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, fontWeight: '600' },
  profItemSrc: { fontSize: 8, fontFamily: fonts.label, fontWeight: '600', color: colors.outline, letterSpacing: 0.6, marginTop: 1 },

  traitOptionsBlock: { marginTop: 10, gap: 6 },
  traitOptionsLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
    marginBottom: 2,
  },
  traitOption: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 10,
  },
  traitOptionSelected: {
    borderColor: colors.secondary + '88',
    backgroundColor: colors.secondary + '0d',
  },
  traitOptionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  traitOptionName: {
    fontSize: 13, fontFamily: fonts.body, fontWeight: '700', color: colors.onSurface,
  },
  traitOptionDesc: {
    fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 16, marginTop: 4, paddingLeft: 24,
  },
});
