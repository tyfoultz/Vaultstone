import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eStats, Dnd5eResources, Dnd5eFeature } from '@vaultstone/types';

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  isOwner: boolean;
  onToggleFeatureUse: (cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string, delta: number) => void;
  onAddFeature: (cat: 'classFeatures' | 'speciesTraits' | 'feats') => void;
  onEditFeature: (cat: 'classFeatures' | 'speciesTraits' | 'feats', feature: Dnd5eFeature) => void;
}

const ACCENT_CLASS = colors.primary;
const ACCENT_SPECIES = colors.secondary;
const ACCENT_FEAT = `#e6a255`; // gm color

export function AbilitiesTab({ stats, resources, isOwner, onToggleFeatureUse, onAddFeature, onEditFeature }: Props) {
  const classFeatures = resources.classFeatures ?? [];
  const speciesTraits = resources.speciesTraits ?? [];
  const feats = resources.feats ?? [];

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>

      {/* Class features */}
      <SectionRow
        label="CLASS FEATURES"
        accent={ACCENT_CLASS}
        onAdd={isOwner ? () => onAddFeature('classFeatures') : undefined}
      />
      {classFeatures.length === 0 ? (
        <EmptyHint text="No class features added yet." />
      ) : (
        classFeatures.map((f) => (
          <FeatureCard
            key={f.id}
            feature={f}
            accent={ACCENT_CLASS}
            canEdit={isOwner}
            onEdit={() => onEditFeature('classFeatures', f)}
            onUse={(delta) => onToggleFeatureUse('classFeatures', f.id, delta)}
          />
        ))
      )}

      {/* Origin feat from stats */}
      {stats.originFeat && (
        <>
          <View style={{ height: 4 }} />
          <ExpandableRow
            title={stats.originFeat}
            subtitle="Origin feat"
            accent={ACCENT_FEAT}
            desc="This feat was granted by your background at character creation."
          />
        </>
      )}

      {/* Species traits */}
      <SectionRow
        label="SPECIES TRAITS"
        accent={ACCENT_SPECIES}
        style={{ marginTop: 16 }}
        onAdd={isOwner ? () => onAddFeature('speciesTraits') : undefined}
      />
      {speciesTraits.length === 0 ? (
        <EmptyHint text="No species traits added yet." />
      ) : (
        speciesTraits.map((f) => (
          <FeatureCard
            key={f.id}
            feature={f}
            accent={ACCENT_SPECIES}
            canEdit={isOwner}
            onEdit={() => onEditFeature('speciesTraits', f)}
            onUse={(delta) => onToggleFeatureUse('speciesTraits', f.id, delta)}
          />
        ))
      )}

      {/* Feats */}
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

      {/* Armor / weapon proficiencies + languages */}
      <SectionRow label="PROFICIENCIES" style={{ marginTop: 16 }} />
      <View style={s.profCard}>
        {stats.armorProficiencies.length > 0 && <ProfLine label="Armor" items={stats.armorProficiencies} />}
        {stats.weaponProficiencies.length > 0 && <ProfLine label="Weapons" items={stats.weaponProficiencies} />}
        {stats.toolProficiencies.length > 0 && <ProfLine label="Tools" items={stats.toolProficiencies} />}
        {stats.languages.length > 0 && <ProfLine label="Languages" items={stats.languages} />}
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

function ExpandableRow({ title, subtitle, accent, desc }: {
  title: string; subtitle: string; accent: string; desc: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.featureCard}>
      <TouchableOpacity style={s.featureHeader} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <View style={[s.accentBar, { backgroundColor: accent }]} />
        <View style={s.featureHeaderText}>
          <Text style={s.featureName}>{title}</Text>
          <Text style={s.featureUses}>{subtitle}</Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={16}
          color={colors.outline}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </TouchableOpacity>
      {open && (
        <View style={s.featureBody}>
          <Text style={s.featureDesc}>{desc}</Text>
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

function ProfLine({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={s.profLine}>
      <Text style={s.profLineLabel}>{label}</Text>
      <Text style={s.profLineValue}>{items.join(' · ')}</Text>
    </View>
  );
}

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

  featureCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden', marginBottom: 8,
  },
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

  profCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 14,
  },
  profLine: { marginBottom: 8 },
  profLineLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
    marginBottom: 2,
  },
  profLineValue: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
});
