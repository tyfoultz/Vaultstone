import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { ContentResolver } from '@vaultstone/content';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import { WizardSigil } from './WizardSigil';
import type { SpeciesResult } from '@vaultstone/types';

const SPECIES_GLYPH: Record<string, string> = {
  human: 'human', elf: 'elf', dwarf: 'dwarf', halfling: 'halfling',
  dragonborn: 'dragonborn', gnome: 'gnome', 'half-elf': 'half-elf',
  tiefling: 'tiefling', orc: 'orc', 'half-orc': 'half-orc',
};

interface Props {
  onPreviewChange?: (inPreview: boolean) => void;
  onAdvance?: () => void;
}

export function StepSpecies({ onPreviewChange, onAdvance }: Props) {
  const { srdVersion, speciesKey, setSpecies } = useCharacterDraftStore(
    useShallow((s) => ({ srdVersion: s.srdVersion, speciesKey: s.speciesKey, setSpecies: s.setSpecies }))
  );

  const [list, setList] = useState<SpeciesResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    ContentResolver.search({ type: 'species', system: 'dnd5e', srdVersion, tiers: ['srd'] })
      .then((r) => setList(r as SpeciesResult[]))
      .finally(() => setLoading(false));
  }, [srdVersion]);

  useEffect(() => { onPreviewChange?.(!!previewKey); }, [previewKey]);

  if (loading) {
    return <View style={s.loadingWrap}><ActivityIndicator color={colors.primary} /></View>;
  }

  const preview = previewKey ? list.find((sp) => sp.key === previewKey) : null;

  if (preview) {
    const isChosen = speciesKey === preview.key;
    const glyph = SPECIES_GLYPH[preview.key] ?? 'human';
    return (
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.backLink} onPress={() => setPreviewKey(null)}>
          <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
          <Text style={s.backLinkText}>All Options</Text>
        </TouchableOpacity>
        <View style={s.detailHeader}>
          <View style={s.detailIcon}>
            <WizardSigil name={glyph} size={36} color={colors.primary} />
          </View>
          <View style={s.detailTitleWrap}>
            <Text style={s.detailTitle}>{preview.name}</Text>
            {preview.description ? (
              <Text style={s.detailSubtitle} numberOfLines={2}>{preview.description}</Text>
            ) : null}
          </View>
        </View>
        <View style={s.detailRows}>
          <DetailRow label="Size" value={preview.size} />
          <DetailRow label="Speed" value={`${preview.speed} ft`} />
        </View>
        {preview.traits.length > 0 && (
          <>
            <Text style={s.sectionLabel}>TRAITS</Text>
            <View style={s.traitList}>
              {preview.traits.map((t) => (
                <Text key={t.name} style={s.traitItem}>
                  <Text style={s.traitName}>{t.name}. </Text>
                  <Text style={s.traitDesc}>{t.description}</Text>
                </Text>
              ))}
            </View>
          </>
        )}
        <View style={{ height: 12 }} />
        <CommitBar
          isChosen={isChosen}
          commitLabel={`Choose ${preview.name}`}
          onCommit={() => { setSpecies(preview.key); onAdvance?.(); }}
          onDeselect={() => { setSpecies(null as any); setPreviewKey(null); }}
          onContinue={isChosen ? onAdvance : undefined}
          onCancel={() => setPreviewKey(null)}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Choose your species</Text>
      <Text style={s.guidance}>Your species shapes your body, senses and inherent gifts. {list.length} available.</Text>
      <View style={s.list}>
        {list.map((sp) => {
          const selected = speciesKey === sp.key;
          const glyph = SPECIES_GLYPH[sp.key] ?? 'human';
          return (
            <TouchableOpacity
              key={sp.key}
              style={[s.card, selected && s.cardSelected]}
              onPress={() => setPreviewKey(sp.key)}
              activeOpacity={0.8}
            >
              {selected && <View style={s.selectedGlow} pointerEvents="none" />}
              <View style={s.cardInner}>
                <View style={[s.iconBox, selected && s.iconBoxSelected]}>
                  <WizardSigil name={glyph} size={32} color={selected ? colors.primary : colors.onSurfaceVariant} />
                </View>
                <View style={s.cardText}>
                  <View style={s.nameRow}>
                    <Text style={s.cardName}>{sp.name}</Text>
                    {selected && <SelectedPip />}
                  </View>
                  <Text style={s.cardBlurb} numberOfLines={2}>{sp.description ?? `${sp.size} · ${sp.speed} ft`}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailRowLabel}>{label}</Text>
      <Text style={s.detailRowValue}>{value}</Text>
    </View>
  );
}

function CommitBar({ isChosen, commitLabel, onCommit, onDeselect, onContinue, onCancel }: {
  isChosen: boolean; commitLabel: string;
  onCommit: () => void; onDeselect: () => void;
  onContinue?: () => void; onCancel: () => void;
}) {
  return (
    <View style={s.commitBar}>
      {isChosen ? (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onDeselect}>
            <Text style={s.commitSecondaryText}>Deselect</Text>
          </TouchableOpacity>
          {onContinue && (
            <TouchableOpacity style={s.commitPrimary} onPress={onContinue}>
              <Text style={s.commitPrimaryText}>Continue →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onCancel}>
            <Text style={s.commitSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.commitPrimary} onPress={onCommit}>
            <Text style={s.commitPrimaryText}>{commitLabel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function SelectedPip() {
  return (
    <View style={s.pip}>
      <MaterialCommunityIcons name="check" size={10} color={colors.onPrimary} />
    </View>
  );
}

const s = StyleSheet.create({
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  title: {
    fontSize: 26, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, marginTop: 12, marginBottom: 8, lineHeight: 30,
  },
  guidance: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 19, marginBottom: 16,
  },
  list: { gap: 10 },
  card: {
    backgroundColor: colors.surfaceContainer, borderWidth: 1,
    borderColor: colors.outlineVariant, borderRadius: radius.xl, padding: 14, overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.primary, backgroundColor: colors.surfaceContainerHigh,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  selectedGlow: {
    position: 'absolute', top: 0, right: 0, width: 80, height: 80,
    borderRadius: 40, backgroundColor: colors.primaryContainer, opacity: 0.1,
  },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHighest, borderWidth: 1,
    borderColor: colors.outlineVariant, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconBoxSelected: { backgroundColor: `${colors.primaryContainer}4d`, borderColor: `${colors.primary}33` },
  cardText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  cardName: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  cardBlurb: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  pip: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  // Detail view
  backLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.md, marginBottom: 14, paddingVertical: 4, alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onSurfaceVariant,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 6 },
  detailIcon: {
    width: 60, height: 60, borderRadius: radius.lg,
    backgroundColor: `${colors.primaryContainer}4d`,
    borderWidth: 1, borderColor: `${colors.primary}33`,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  detailTitleWrap: { flex: 1, minWidth: 0 },
  detailTitle: {
    fontSize: 22, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, lineHeight: 26, marginBottom: 4,
  },
  detailSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  detailRows: { marginTop: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 3 },
  detailRowLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, width: 80,
  },
  detailRowValue: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '700', color: colors.primary, flex: 1 },
  sectionLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, marginTop: 18, marginBottom: 8,
  },
  traitList: { gap: 6 },
  traitItem: { fontSize: 12, fontFamily: fonts.body, lineHeight: 18 },
  traitName: { fontWeight: '700', color: colors.primary, fontFamily: fonts.headline },
  traitDesc: { color: colors.onSurfaceVariant },
  // Commit bar
  commitBar: { marginTop: 4, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  commitRow: { flexDirection: 'row', gap: 8 },
  commitSecondary: {
    paddingHorizontal: 16, paddingVertical: 13, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  commitSecondaryText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  commitPrimary: {
    flex: 1, paddingVertical: 14, borderRadius: radius.xl,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  commitPrimaryText: {
    fontSize: 14, fontFamily: fonts.body, fontWeight: '700',
    color: colors.onPrimary, letterSpacing: 0.5,
  },
});
