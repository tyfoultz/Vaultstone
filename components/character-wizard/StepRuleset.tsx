import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { getCampaigns } from '@vaultstone/api';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

const RULESETS = [
  {
    system: 'dnd5e',
    srdVersion: 'SRD_2.0' as const,
    label: 'D&D 5e',
    year: '2024',
    subtitle: 'SRD 2.0',
    blurb: 'Updated rules. 10 species, 14 backgrounds, origin feats.',
    tag: 'Recommended',
  },
  {
    system: 'dnd5e',
    srdVersion: 'SRD_5.1' as const,
    label: 'D&D 5e',
    year: '2014',
    subtitle: 'SRD 5.1',
    blurb: 'Classic rules. 9 species, 1 background.',
    tag: 'Classic',
  },
] as const;

type Ruleset = (typeof RULESETS)[number];

// Translate the campaign's `system` (dnd5e_2014 | dnd5e_2024 | dnd5e legacy
// alias | custom) into the wizard's draft (system + srdVersion). Keep the
// draft.system at the legacy 'dnd5e' alias because SRD content rows are
// keyed under it; the campaign edition is conveyed through srdVersion.
// Mirrors the helper in app/character/new.tsx — kept inline here so this
// step is self-contained.
function campaignSystemToRuleset(systemId: string): Ruleset {
  if (systemId === 'dnd5e_2014') return RULESETS[1]; // 5.1
  return RULESETS[0]; // dnd5e_2024 / legacy / custom → 2024 SRD
}

export function StepRuleset() {
  const { srdVersion, setRuleset, campaignId, setCampaignId } = useCharacterDraftStore(
    useShallow((s) => ({
      srdVersion: s.srdVersion,
      setRuleset: s.setRuleset,
      campaignId: s.campaignId,
      setCampaignId: s.setCampaignId,
    }))
  );

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCampaigns().then(({ data }) => {
      if (cancelled) return;
      setCampaigns((data ?? []).filter((c) => !c.is_archived));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const linkedCampaign = useMemo(
    () => (campaignId ? campaigns.find((c) => c.id === campaignId) : null),
    [campaigns, campaignId],
  );

  function handlePickCampaign(c: Campaign) {
    setCampaignId(c.id);
    const matching = campaignSystemToRuleset(c.system);
    setRuleset(matching.system, matching.srdVersion);
  }

  function handleUnlink() {
    setCampaignId(null);
    // Leave the ruleset where the user previously had it — they may want
    // to keep the same edition selected after unlinking.
  }

  // When linked, the ruleset cards are locked to the campaign's edition.
  const lockedSrdVersion = linkedCampaign
    ? campaignSystemToRuleset(linkedCampaign.system).srdVersion
    : null;

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Choose a ruleset</Text>

      {/* ── Linked Campaign section ───────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>Linked Campaign</Text>
          <Text style={s.sectionMeta}>Recommended first</Text>
        </View>
        <Text style={s.guidance}>
          If you're rolling for a campaign, link it now so the wizard uses that
          campaign's ruleset and content packs. Linking after selecting a ruleset
          will overwrite your choice.
        </Text>

        {loading ? (
          <View style={s.loaderRow}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : campaigns.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>
              You aren't part of any campaigns yet. You can still create a
              standalone character; link a campaign later from the campaign
              page.
            </Text>
          </View>
        ) : (
          <View style={s.campaignList}>
            {/* "Standalone" option — explicit, so the absence of a linked
                campaign isn't ambiguous. */}
            <TouchableOpacity
              style={[s.campaignRow, !linkedCampaign && s.campaignRowSelected]}
              onPress={handleUnlink}
              activeOpacity={0.85}
            >
              <View style={[s.campaignRadio, !linkedCampaign && s.campaignRadioSelected]} />
              <View style={{ flex: 1 }}>
                <Text style={s.campaignName}>No campaign (standalone)</Text>
                <Text style={s.campaignSub}>Pick any ruleset below</Text>
              </View>
            </TouchableOpacity>

            {campaigns.map((c) => {
              const selected = linkedCampaign?.id === c.id;
              const ruleset = campaignSystemToRuleset(c.system);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[s.campaignRow, selected && s.campaignRowSelected]}
                  onPress={() => handlePickCampaign(c)}
                  activeOpacity={0.85}
                >
                  <View style={[s.campaignRadio, selected && s.campaignRadioSelected]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.campaignName}>{c.name}</Text>
                    <Text style={s.campaignSub}>
                      {ruleset.label} {ruleset.year} · {c.system_label ?? 'Campaign'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* ── Ruleset section ───────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>Ruleset</Text>
          {lockedSrdVersion ? <Text style={s.sectionMeta}>Locked</Text> : null}
        </View>

        {linkedCampaign ? (
          <View style={s.lockBanner}>
            <Text style={s.lockTitle}>Locked by campaign</Text>
            <Text style={s.lockText}>
              {linkedCampaign.name} uses{' '}
              <Text style={s.lockEmphasis}>
                {campaignSystemToRuleset(linkedCampaign.system).label}{' '}
                {campaignSystemToRuleset(linkedCampaign.system).year}
              </Text>
              . Unlink the campaign above to change rulesets.
            </Text>
          </View>
        ) : (
          <Text style={s.guidance}>
            Both editions are fully playable. The 2024 rules are smoother for new players.
          </Text>
        )}

        <View style={s.list}>
          {RULESETS.map((r) => {
            const selected = srdVersion === r.srdVersion;
            const locked = lockedSrdVersion !== null;
            const lockedHidden = locked && r.srdVersion !== lockedSrdVersion;
            return (
              <TouchableOpacity
                key={r.srdVersion}
                style={[
                  s.card,
                  selected && s.cardSelected,
                  lockedHidden && s.cardDisabled,
                ]}
                onPress={() => {
                  if (locked) return; // ruleset is owned by the linked campaign
                  setRuleset(r.system, r.srdVersion);
                }}
                disabled={locked}
                activeOpacity={locked ? 1 : 0.8}
              >
                {selected && <View style={s.selectedGlow} pointerEvents="none" />}
                <View style={s.cardInner}>
                  <View style={[s.radio, selected && s.radioSelected]} />
                  <View style={s.cardText}>
                    <Text style={s.cardName}>
                      {r.label}{' '}
                      <Text style={s.cardYear}>{r.year}</Text>
                    </Text>
                    <Text style={s.cardBlurb}>{r.blurb}</Text>
                    <View style={s.tagRow}>
                      <Text style={s.metaLabel}>{r.subtitle}</Text>
                      <View style={[s.tagPill, r.tag === 'Recommended' && s.tagPillRecommended]}>
                        <Text style={[s.tagText, r.tag === 'Recommended' && s.tagTextRecommended]}>
                          {r.tag}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.headline,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.5,
    marginTop: 12,
    marginBottom: 16,
    lineHeight: 30,
  },

  // Section scaffolding (Linked Campaign + Ruleset)
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.outline,
  },
  sectionMeta: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  guidance: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
    marginBottom: 12,
  },

  // Linked-campaign list
  loaderRow: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  emptyText: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
  },
  campaignList: {
    gap: 6,
  },
  campaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
    padding: 12,
  },
  campaignRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerHigh,
  },
  campaignRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
  },
  campaignRadioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  campaignName: {
    fontSize: 15,
    fontFamily: fonts.headline,
    fontWeight: '600',
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  campaignSub: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },

  // Locked banner
  lockBanner: {
    backgroundColor: colors.primaryContainer + '22',
    borderWidth: 1,
    borderColor: colors.primary + '55',
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 12,
  },
  lockTitle: {
    fontSize: 11,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: 4,
  },
  lockText: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
  },
  lockEmphasis: {
    color: colors.onSurface,
    fontWeight: '700',
  },

  // Ruleset cards (existing)
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
    padding: 14,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerHigh,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  cardDisabled: {
    opacity: 0.45,
  },
  selectedGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryContainer,
    opacity: 0.12,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    marginTop: 3,
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  cardText: {
    flex: 1,
  },
  cardName: {
    fontSize: 19,
    fontFamily: fonts.headline,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  cardYear: {
    color: colors.primary,
  },
  cardBlurb: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaLabel: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.outline,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceContainerHighest,
  },
  tagPillRecommended: {
    backgroundColor: colors.playerContainer,
  },
  tagText: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.outline,
  },
  tagTextRecommended: {
    color: colors.player,
  },
});
