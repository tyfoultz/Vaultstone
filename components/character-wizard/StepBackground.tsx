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
import type { BackgroundResult } from '@vaultstone/types';

const BG_GLYPH: Record<string, string> = {
  acolyte: 'sun', artisan: 'hammer', charlatan: 'mask', criminal: 'dagger',
  entertainer: 'lute', farmer: 'leaf', guard: 'shield', hermit: 'moon',
  noble: 'crown', sage: 'book', sailor: 'wave', soldier: 'sword',
  urchin: 'mask', wayfarer: 'compass',
};

const ABILITY_SHORT: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

interface Props {
  onPreviewChange?: (inPreview: boolean) => void;
  onAdvance?: () => void;
}

export function StepBackground({ onPreviewChange, onAdvance }: Props) {
  const { srdVersion, backgroundKey, setBackground } = useCharacterDraftStore(
    useShallow((s) => ({ srdVersion: s.srdVersion, backgroundKey: s.backgroundKey, setBackground: s.setBackground }))
  );

  const [list, setList] = useState<BackgroundResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    ContentResolver.search({ type: 'background', system: 'dnd5e', srdVersion, tiers: ['srd'] })
      .then((r) => setList(r as BackgroundResult[]))
      .finally(() => setLoading(false));
  }, [srdVersion]);

  useEffect(() => { onPreviewChange?.(!!previewKey); }, [previewKey]);

  if (loading) {
    return <View style={s.loadingWrap}><ActivityIndicator color={colors.primary} /></View>;
  }

  const preview = previewKey ? list.find((b) => b.key === previewKey) : null;

  if (preview) {
    const isChosen = backgroundKey === preview.key;
    const glyph = BG_GLYPH[preview.key] ?? 'book';
    const abilityOpts = preview.abilityScoreOptions.map((a) => ABILITY_SHORT[a] ?? a.toUpperCase()).join(', ');

    return (
      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={s.backLink} onPress={() => setPreviewKey(null)}>
          <MaterialCommunityIcons name="chevron-left" size={16} color={colors.onSurfaceVariant} />
          <Text style={s.backLinkText}>All Options</Text>
        </TouchableOpacity>

        {/* Header — uses gm accent for background */}
        <View style={s.detailHeader}>
          <View style={s.detailIcon}>
            <WizardSigil name={glyph} size={36} color={colors.gm} />
          </View>
          <View style={s.detailTitleWrap}>
            <Text style={s.detailTitle}>{preview.name}</Text>
            {preview.description ? (
              <Text style={s.detailSubtitle} numberOfLines={2}>{preview.description}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.detailRows}>
          <DetailRow label="Skills" value={preview.skillProficiencies.join(', ')} />
          {preview.toolProficiency && <DetailRow label="Tool" value={preview.toolProficiency} />}
          <DetailRow label="Ability Scores" value={`+2/+1 from ${abilityOpts}`} />
          <DetailRowAccent label="Origin Feat" value={preview.originFeat} />
        </View>

        <View style={{ height: 12 }} />
        <CommitBar
          isChosen={isChosen}
          commitLabel={`Choose ${preview.name}`}
          onCommit={() => { setBackground(preview.key); onAdvance?.(); }}
          onDeselect={() => { setBackground(null as any); setPreviewKey(null); }}
          onContinue={isChosen ? onAdvance : undefined}
          onCancel={() => setPreviewKey(null)}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Choose a background</Text>
      <Text style={s.guidance}>Your life before adventure — giving you skills, a tool, and a starting feat. {list.length} available.</Text>
      <View style={s.list}>
        {list.map((b) => {
          const selected = backgroundKey === b.key;
          const glyph = BG_GLYPH[b.key] ?? 'book';
          return (
            <TouchableOpacity
              key={b.key}
              style={[s.card, selected && s.cardSelected]}
              onPress={() => setPreviewKey(b.key)}
              activeOpacity={0.8}
            >
              {selected && <View style={s.selectedGlow} pointerEvents="none" />}
              <View style={s.cardInner}>
                <View style={[s.iconBox, selected && s.iconBoxSelected]}>
                  <WizardSigil name={glyph} size={32} color={selected ? colors.gm : colors.onSurfaceVariant} />
                </View>
                <View style={s.cardText}>
                  <View style={s.nameRow}>
                    <Text style={s.cardName}>{b.name}</Text>
                    {selected && <SelectedPip />}
                  </View>
                  <Text style={s.cardBlurb} numberOfLines={2}>{b.description ?? b.skillProficiencies.join(', ')}</Text>
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

function DetailRowAccent({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailRowLabel}>{label}</Text>
      <Text style={[s.detailRowValue, { color: colors.gm, fontWeight: '700' }]}>{value}</Text>
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
            <TouchableOpacity style={[s.commitPrimary, { backgroundColor: colors.gm }]} onPress={onContinue}>
              <Text style={[s.commitPrimaryText, { color: colors.onGm }]}>Continue →</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={s.commitRow}>
          <TouchableOpacity style={s.commitSecondary} onPress={onCancel}>
            <Text style={s.commitSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.commitPrimary, { backgroundColor: colors.gm }]} onPress={onCommit}>
            <Text style={[s.commitPrimaryText, { color: colors.onGm }]}>{commitLabel}</Text>
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
  guidance: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 19, marginBottom: 16 },
  list: { gap: 10 },
  card: {
    backgroundColor: colors.surfaceContainer, borderWidth: 1,
    borderColor: colors.outlineVariant, borderRadius: radius.xl, padding: 14, overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.gm, backgroundColor: colors.surfaceContainerHigh,
    shadowColor: colors.gm, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  selectedGlow: {
    position: 'absolute', top: 0, right: 0, width: 80, height: 80,
    borderRadius: 40, backgroundColor: colors.gmContainer, opacity: 0.2,
  },
  cardInner: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconBox: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHighest, borderWidth: 1,
    borderColor: colors.outlineVariant, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  iconBoxSelected: { backgroundColor: `${colors.gmContainer}99`, borderColor: `${colors.gm}33` },
  cardText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  cardName: { fontSize: 16, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface },
  cardBlurb: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  pip: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.gm, alignItems: 'center', justifyContent: 'center' },
  // Detail
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
    backgroundColor: `${colors.gmContainer}99`, borderWidth: 1,
    borderColor: `${colors.gm}33`, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  detailTitleWrap: { flex: 1, minWidth: 0 },
  detailTitle: {
    fontSize: 22, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, lineHeight: 26, marginBottom: 4,
  },
  detailSubtitle: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17 },
  detailRows: { marginTop: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 3 },
  detailRowLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.outline, width: 100,
  },
  detailRowValue: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '600', color: colors.onSurface, flex: 1 },
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
  commitPrimaryText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.5 },
});
