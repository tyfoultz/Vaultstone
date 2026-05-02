import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useCharacterDraftStore, useAuthStore, useCampaignStore, type RulesetMode } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { getCampaigns, getCampaignByJoinCode, joinCampaign } from '@vaultstone/api';
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

// dnd5e_2014 → SRD 5.1; everything else (dnd5e_2024 / legacy dnd5e / custom)
// → 2024 SRD. Keeps draft.system at the legacy 'dnd5e' alias because SRD
// content rows are keyed under it; the campaign edition is conveyed via
// srdVersion which the content bundles filter on.
function campaignSystemToRuleset(systemId: string): Ruleset {
  if (systemId === 'dnd5e_2014') return RULESETS[1];
  return RULESETS[0];
}

// Three-state machine for the step. `null` = initial fork (user hasn't
// committed to either path); `'campaign'` / `'standalone'` route to their
// respective sub-screens. The store's `rulesetMode` field carries this
// across remounts so the wizard parent can read it (it gates the Next
// button — Next is disabled while the user is on the fork screen).
//
// On first mount with a clean draft, rulesetMode is `null` → fork. If the
// user already has a campaign linked (e.g. wizard launched with
// ?campaignId=, or they previously picked a campaign), we surface the
// campaign mode automatically. The wizard's parent sets rulesetMode in
// both of those flows.

export function StepRuleset() {
  const {
    srdVersion, setRuleset,
    campaignId, setCampaignId,
    rulesetMode, setRulesetMode,
  } =
    useCharacterDraftStore(
      useShallow((s) => ({
        srdVersion: s.srdVersion,
        setRuleset: s.setRuleset,
        campaignId: s.campaignId,
        setCampaignId: s.setCampaignId,
        rulesetMode: s.rulesetMode,
        setRulesetMode: s.setRulesetMode,
      }))
    );

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCampaigns().then(({ data }) => {
      if (cancelled) return;
      setCampaigns((data ?? []).filter((c) => !c.is_archived));
      setLoadingCampaigns(false);
    });
    return () => { cancelled = true; };
  }, []);

  const linkedCampaign = useMemo<Campaign | null>(
    () => (campaignId ? campaigns.find((c) => c.id === campaignId) ?? null : null),
    [campaigns, campaignId],
  );

  function handlePickCampaign(c: Campaign) {
    setCampaignId(c.id);
    const matching = campaignSystemToRuleset(c.system);
    setRuleset(matching.system, matching.srdVersion);
  }

  /**
   * Called by the inline join form after a successful join. Add the new
   * row to the visible campaigns list (so it appears under Your
   * Campaigns) and auto-select it — the user expects the campaign they
   * just joined to be the one they're rolling under.
   */
  function handleJoined(c: Campaign) {
    setCampaigns((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
    handlePickCampaign(c);
  }

  function startStandalone() {
    setCampaignId(null);
    setRulesetMode('standalone');
  }

  function startCampaign() {
    setRulesetMode('campaign');
  }

  function backToChoice() {
    // Going back to the fork screen doesn't clear the user's prior
    // selection — flipping between paths preserves their state. The Next
    // button gate uses rulesetMode === null, so backing to the fork
    // intentionally re-disables Next until they commit again.
    setRulesetMode(null);
  }

  // Resolve the effective sub-screen. If a campaign is linked but the
  // mode hasn't been written yet (e.g. the wizard was launched from a
  // campaign route before the parent finished its bootstrap effect), show
  // the campaign view.
  const effectiveMode: RulesetMode = rulesetMode ?? (campaignId ? 'campaign' : null);

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      {effectiveMode === null ? (
        <ChoiceScreen
          hasCampaigns={campaigns.length > 0}
          loading={loadingCampaigns}
          onPickCampaign={startCampaign}
          onPickStandalone={startStandalone}
        />
      ) : effectiveMode === 'campaign' ? (
        <CampaignModeScreen
          campaigns={campaigns}
          loading={loadingCampaigns}
          linkedCampaign={linkedCampaign}
          srdVersion={srdVersion}
          onBack={backToChoice}
          onPick={handlePickCampaign}
          onJoined={handleJoined}
        />
      ) : (
        <StandaloneModeScreen
          srdVersion={srdVersion}
          onBack={backToChoice}
          onPick={(r) => setRuleset(r.system, r.srdVersion)}
        />
      )}
    </ScrollView>
  );
}

// ── Initial fork: pick a path ─────────────────────────────────────────────

function ChoiceScreen({
  hasCampaigns,
  loading,
  onPickCampaign,
  onPickStandalone,
}: {
  hasCampaigns: boolean;
  loading: boolean;
  onPickCampaign: () => void;
  onPickStandalone: () => void;
}) {
  return (
    <View>
      <Text style={s.title}>Where will this character play?</Text>
      <Text style={s.guidance}>
        Linking a campaign now lets the wizard use that campaign's ruleset and
        any homebrew the DM has approved. You can always unlink later.
      </Text>

      <View style={s.choiceList}>
        <TouchableOpacity
          style={[s.choiceCard, !hasCampaigns && !loading && s.choiceCardMuted]}
          onPress={hasCampaigns ? onPickCampaign : undefined}
          disabled={!hasCampaigns}
          activeOpacity={0.85}
        >
          <Text style={s.choiceTag}>Recommended</Text>
          <Text style={s.choiceTitle}>Link a campaign</Text>
          <Text style={s.choiceBody}>
            {loading
              ? 'Checking your campaigns…'
              : hasCampaigns
                ? "Inherit the campaign's ruleset and content packs. Best for players joining an existing game."
                : "You aren't part of any campaigns yet. Create or join one first, or pick standalone for now."}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.choiceCard}
          onPress={onPickStandalone}
          activeOpacity={0.85}
        >
          <Text style={[s.choiceTag, s.choiceTagMuted]}>Flexible</Text>
          <Text style={s.choiceTitle}>Standalone character</Text>
          <Text style={s.choiceBody}>
            Pick the ruleset yourself. Good for one-shots, NPCs, or a build
            you'll link to a campaign later.
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Campaign mode: pick a campaign, ruleset locks to it ───────────────────

function CampaignModeScreen({
  campaigns,
  loading,
  linkedCampaign,
  srdVersion,
  onBack,
  onPick,
  onJoined,
}: {
  campaigns: Campaign[];
  loading: boolean;
  linkedCampaign: Campaign | null;
  srdVersion: 'SRD_5.1' | 'SRD_2.0';
  onBack: () => void;
  onPick: (c: Campaign) => void;
  onJoined: (c: Campaign) => void;
}) {
  const lockedRuleset = linkedCampaign
    ? campaignSystemToRuleset(linkedCampaign.system)
    : null;

  return (
    <View>
      <BackRow onPress={onBack} />
      <Text style={s.title}>Pick a campaign</Text>
      <Text style={s.guidance}>
        The wizard will use this campaign's ruleset and any homebrew the DM
        has enabled.
      </Text>

      {/* ── Join a New Campaign ───────────────────────────────────────── */}
      {/* Pinned to the top because new players hitting this step have a
          code in hand and shouldn't have to scroll past the existing-
          campaigns list to enter it. */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>Join a New Campaign</Text>
        </View>
        <Text style={s.guidance}>
          Have a 6-character code from a DM? Join here — the campaign will be
          added to your list and selected automatically.
        </Text>
        <JoinCodeForm onJoined={onJoined} alreadyIn={campaigns} />
      </View>

      <View style={s.sectionDivider} />

      {/* ── Your Campaigns ────────────────────────────────────────────── */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>Your Campaigns</Text>
          {!loading ? (
            <Text style={s.sectionMeta}>{campaigns.length} available</Text>
          ) : null}
        </View>

        {loading ? (
          <View style={s.loaderRow}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : campaigns.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>
              You aren't part of any campaigns yet. Use the join form above,
              or go back and pick "Standalone character".
            </Text>
          </View>
        ) : (
          <View style={s.campaignList}>
            {campaigns.map((c) => {
              const selected = linkedCampaign?.id === c.id;
              const ruleset = campaignSystemToRuleset(c.system);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[s.campaignRow, selected && s.campaignRowSelected]}
                  onPress={() => onPick(c)}
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

      {/* ── Locked ruleset preview (shows once a campaign is selected) ── */}
      {lockedRuleset ? (
        <View style={[s.section, { marginTop: spacing.lg }]}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>Ruleset</Text>
            <Text style={s.sectionMeta}>Locked</Text>
          </View>
          <View style={s.lockBanner}>
            <Text style={s.lockTitle}>Locked by campaign</Text>
            <Text style={s.lockText}>
              {linkedCampaign?.name} uses{' '}
              <Text style={s.lockEmphasis}>
                {lockedRuleset.label} {lockedRuleset.year}
              </Text>
              .
            </Text>
          </View>
          <View style={s.list}>
            {RULESETS.map((r) => {
              const selected = srdVersion === r.srdVersion;
              const dim = r.srdVersion !== lockedRuleset.srdVersion;
              return (
                <View
                  key={r.srdVersion}
                  style={[s.card, selected && s.cardSelected, dim && s.cardDisabled]}
                >
                  {selected && <View style={s.selectedGlow} pointerEvents="none" />}
                  <RulesetCardInner ruleset={r} selected={selected} />
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── Inline join-code form ────────────────────────────────────────────────
//
// Mirrors app/campaign/join.tsx's behavior — uses the same getCampaignByJoinCode
// + joinCampaign API pair and the same "already in" guard — but reports back
// to the parent via onJoined instead of routing to /campaign/[id]/pick-character.
// The wizard handles selection + advancement itself.

function JoinCodeForm({
  onJoined,
  alreadyIn,
}: {
  onJoined: (c: Campaign) => void;
  alreadyIn: Campaign[];
}) {
  const user = useAuthStore((s) => s.user);
  const addCampaign = useCampaignStore((s) => s.addCampaign);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError('Join codes are 6 characters.');
      return;
    }
    if (!user) return;

    setSubmitting(true);
    setError('');

    const { data: campaign, error: lookupErr } = await getCampaignByJoinCode(trimmed);
    if (lookupErr || !campaign) {
      setSubmitting(false);
      setError('Campaign not found. Check the code and try again.');
      return;
    }

    // Already-a-member guard: DMs of the campaign or existing members
    // skip the insert (which would fail on the unique constraint anyway).
    const already =
      campaign.dm_user_id === user.id ||
      alreadyIn.some((c) => c.id === campaign.id);

    if (!already) {
      const { error: joinErr } = await joinCampaign(campaign.id, user.id);
      if (joinErr) {
        setSubmitting(false);
        setError('Failed to join. Please try again.');
        return;
      }
      // Mirror in the global campaign store so other surfaces (the
      // Campaigns drawer page, etc.) reflect the new membership next
      // time they read.
      addCampaign(campaign);
    }

    setSubmitting(false);
    setCode('');
    onJoined(campaign);
  }

  return (
    <View style={s.joinRow}>
      <TextInput
        style={s.joinInput}
        placeholder="XXXXXX"
        placeholderTextColor={colors.outlineVariant}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={6}
        returnKeyType="done"
        onSubmitEditing={handleJoin}
        editable={!submitting}
      />
      <TouchableOpacity
        style={[s.joinBtn, (code.length !== 6 || submitting) && s.joinBtnDisabled]}
        onPress={handleJoin}
        disabled={code.length !== 6 || submitting}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={s.joinBtnText}>Join</Text>
        )}
      </TouchableOpacity>
      {error ? <Text style={s.joinError}>{error}</Text> : null}
    </View>
  );
}

// ── Standalone mode: just the ruleset cards ───────────────────────────────

function StandaloneModeScreen({
  srdVersion,
  onBack,
  onPick,
}: {
  srdVersion: 'SRD_5.1' | 'SRD_2.0';
  onBack: () => void;
  onPick: (r: Ruleset) => void;
}) {
  return (
    <View>
      <BackRow onPress={onBack} />
      <Text style={s.title}>Choose a ruleset</Text>
      <Text style={s.guidance}>
        Both editions are fully playable. The 2024 rules are smoother for new
        players.
      </Text>

      <View style={s.list}>
        {RULESETS.map((r) => {
          const selected = srdVersion === r.srdVersion;
          return (
            <TouchableOpacity
              key={r.srdVersion}
              style={[s.card, selected && s.cardSelected]}
              onPress={() => onPick(r)}
              activeOpacity={0.8}
            >
              {selected && <View style={s.selectedGlow} pointerEvents="none" />}
              <RulesetCardInner ruleset={r} selected={selected} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Shared bits ───────────────────────────────────────────────────────────

function BackRow({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={s.backRow} activeOpacity={0.7} hitSlop={8}>
      <Text style={s.backArrow}>←</Text>
      <Text style={s.backLabel}>Change choice</Text>
    </TouchableOpacity>
  );
}

function RulesetCardInner({ ruleset: r, selected }: { ruleset: Ruleset; selected: boolean }) {
  return (
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
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },

  // Headers
  title: {
    fontSize: 26,
    fontFamily: fonts.headline,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.5,
    marginTop: 12,
    marginBottom: 8,
    lineHeight: 30,
  },
  guidance: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
    marginBottom: 16,
  },

  // Back row
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  backArrow: {
    fontSize: 16,
    color: colors.primary,
    fontFamily: fonts.body,
  },
  backLabel: {
    fontSize: 13,
    fontFamily: fonts.label,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: colors.primary,
  },

  // Choice cards (initial fork)
  choiceList: {
    gap: 10,
  },
  choiceCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: radius.xl,
    padding: 16,
    gap: 6,
  },
  choiceCardMuted: {
    opacity: 0.55,
  },
  choiceTag: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  choiceTagMuted: {
    color: colors.outline,
  },
  choiceTitle: {
    fontSize: 19,
    fontFamily: fonts.headline,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.4,
  },
  choiceBody: {
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    lineHeight: 19,
  },

  // Section helpers (used inside campaign mode)
  section: {},
  // Vertical breathing room between Join + Your Campaigns sections so
  // they read as distinct groupings rather than one long list.
  sectionDivider: {
    height: spacing.lg,
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

  // Campaign list
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

  // Join-code form
  joinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  joinInput: {
    flexGrow: 1,
    flexBasis: 200,
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: radius.lg,
    color: colors.onSurface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
    fontFamily: fonts.headline,
  },
  joinBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  joinBtnDisabled: {
    opacity: 0.45,
  },
  joinBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  joinError: {
    flexBasis: '100%',
    fontSize: 12,
    color: colors.hpDanger,
    fontFamily: fonts.body,
    marginTop: 4,
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

  // Ruleset cards
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
