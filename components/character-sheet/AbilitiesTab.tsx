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
  onToggleFeatureUse: (cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string, delta: number) => void;
  onAddFeature: (cat: 'classFeatures' | 'speciesTraits' | 'feats') => void;
  onEditFeature: (cat: 'classFeatures' | 'speciesTraits' | 'feats', feature: Dnd5eFeature) => void;
}

const ACCENT_CLASS = colors.primary;
const ACCENT_SUBCLASS = '#a78bfa';
const ACCENT_SPECIES = colors.secondary;
const ACCENT_FEAT = `#e6a255`; // gm color
const ACCENT_BG = '#7dd3fc';

export function AbilitiesTab({
  stats, resources, isOwner,
  classResultsByKey, subclassResultsByKey, speciesResult, backgroundResult, originFeatResult,
  onToggleFeatureUse, onAddFeature, onEditFeature,
}: Props) {
  const customClassFeatures = resources.classFeatures ?? [];
  const customSpeciesTraits = resources.speciesTraits ?? [];
  const feats = resources.feats ?? [];
  const entries = getClassEntries(stats);

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
            features.map((f, i) => (
              <ContentFeatureCard
                key={`class-${entry.classKey}-${i}-${f.name}`}
                name={f.name}
                description={f.description ?? ''}
                level={f.level}
                accent={ACCENT_CLASS}
                indented={!!f.parentName}
              />
            ))
          )}
        </View>
      ))}

      {/* Custom class features the player added by hand. Kept distinct so
          they don't disappear if the resolver hasn't returned yet, and so
          homebrew authors can layer extra entries on top of catalog ones. */}
      {customClassFeatures.length > 0 && (
        <>
          <SectionSubRow label="CUSTOM" accent={ACCENT_CLASS} onAdd={isOwner ? () => onAddFeature('classFeatures') : undefined} />
          {customClassFeatures.map((f) => (
            <FeatureCard
              key={f.id}
              feature={f}
              accent={ACCENT_CLASS}
              canEdit={isOwner}
              onEdit={() => onEditFeature('classFeatures', f)}
              onUse={(delta) => onToggleFeatureUse('classFeatures', f.id, delta)}
            />
          ))}
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
                features.map((f, i) => (
                  <ContentFeatureCard
                    key={`sub-${entry.subclassKey}-${i}-${f.name}`}
                    name={f.name}
                    description={f.description}
                    level={f.level}
                    accent={ACCENT_SUBCLASS}
                  />
                ))
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
          {backgroundResult.startingEquipment.length > 0 ? (
            // Structured form: render each option's items + optional gold.
            // Multiple options render as "Option A | Option B" with their
            // contents on a single line each — same compact treatment the
            // freeform string had before.
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
      {originFeatResult ? (
        <ContentFeatureCard
          name={originFeatResult.name}
          description={[
            originFeatResult.description ?? '',
            ...(originFeatResult.benefits ?? []).map((b) => `• ${b}`),
          ].filter(Boolean).join('\n\n')}
          subtitle="Origin feat"
          accent={ACCENT_FEAT}
        />
      ) : stats.originFeat ? (
        <ContentFeatureCard
          name={stats.originFeat}
          subtitle="Origin feat"
          accent={ACCENT_FEAT}
          description="This feat was granted by your background at character creation."
        />
      ) : null}

      {/* ── Species traits (live from ContentResolver) ── */}
      <SectionRow label="SPECIES TRAITS" accent={ACCENT_SPECIES} style={{ marginTop: 16 }} />
      {speciesResult && (speciesResult.traits ?? []).length > 0 ? (
        speciesResult.traits.map((t, i) => (
          <ContentFeatureCard
            key={`species-${i}-${t.name}`}
            name={t.name}
            description={t.description}
            accent={ACCENT_SPECIES}
            level={t.level}
          />
        ))
      ) : !speciesResult ? (
        <EmptyHint text="Resolving species traits…" />
      ) : (
        <EmptyHint text="No species traits in this entry." />
      )}

      {/* Custom species traits the player added. */}
      {customSpeciesTraits.length > 0 && (
        <>
          <SectionSubRow label="CUSTOM" accent={ACCENT_SPECIES} onAdd={isOwner ? () => onAddFeature('speciesTraits') : undefined} />
          {customSpeciesTraits.map((f) => (
            <FeatureCard
              key={f.id}
              feature={f}
              accent={ACCENT_SPECIES}
              canEdit={isOwner}
              onEdit={() => onEditFeature('speciesTraits', f)}
              onUse={(delta) => onToggleFeatureUse('speciesTraits', f.id, delta)}
            />
          ))}
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
        feats.map((f) => (
          <FeatureCard
            key={f.id}
            feature={f}
            accent={ACCENT_FEAT}
            canEdit={isOwner}
            onEdit={() => onEditFeature('feats', f)}
            onUse={(delta) => onToggleFeatureUse('feats', f.id, delta)}
          />
        ))
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
function ContentFeatureCard({ name, description, accent, level, subtitle, indented }: {
  name: string;
  description?: string;
  accent: string;
  level?: number;
  subtitle?: string;
  indented?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.featureCard, indented && s.featureCardIndent]}>
      <TouchableOpacity style={s.featureHeader} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <View style={[s.accentBar, { backgroundColor: accent }]} />
        <View style={s.featureHeaderText}>
          <Text style={s.featureName}>{name}</Text>
          {(subtitle || level) && (
            <Text style={s.featureUses}>{subtitle ?? (level ? `Level ${level}` : '')}</Text>
          )}
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={16}
          color={colors.outline}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {open && description ? (
        <View style={s.featureBody}>
          <Text style={s.featureDesc}>{description}</Text>
        </View>
      ) : null}
    </View>
  );
}

function FeatureCard({ feature, accent, canEdit, onEdit, onUse }: {
  feature: Dnd5eFeature;
  accent: string;
  canEdit: boolean;
  onEdit: () => void;
  onUse: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.featureCard}>
      <TouchableOpacity style={s.featureHeader} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <View style={[s.accentBar, { backgroundColor: accent }]} />
        <View style={s.featureHeaderText}>
          <Text style={s.featureName}>{feature.name}</Text>
          {feature.uses && (
            <Text style={s.featureUses}>{feature.uses.current}/{feature.uses.max} · {feature.uses.recharge}</Text>
          )}
        </View>
        {canEdit && (
          <TouchableOpacity onPress={onEdit} hitSlop={8}>
            <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.outline} />
          </TouchableOpacity>
        )}
        <MaterialCommunityIcons
          name="chevron-right"
          size={16}
          color={colors.outline}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {open && (
        <View style={s.featureBody}>
          {feature.description ? (
            <Text style={s.featureDesc}>{feature.description}</Text>
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

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: 14 },

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

  featureCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden', marginBottom: 8,
  },
  featureCardIndent: { marginLeft: 16 },
  featureHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingRight: 12, paddingVertical: 11, gap: 10,
  },
  accentBar: { width: 4, height: 22, borderRadius: 2 },
  featureHeaderText: { flex: 1, minWidth: 0 },
  featureName: { fontSize: 13, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface },
  featureUses: { fontSize: 10, color: colors.outline, marginTop: 1 },
  featureBody: {
    paddingHorizontal: 16, paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  featureDesc: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 18, marginTop: 10,
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
});
