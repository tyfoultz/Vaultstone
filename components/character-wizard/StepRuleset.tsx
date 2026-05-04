import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useCharacterDraftStore, useAuthStore, useCampaignStore, type RulesetMode } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import {
  getCampaigns,
  getCampaignByJoinCode,
  joinCampaign,
  listCampaignPacks,
  listHomebrewPacks,
  type HomebrewPackRow,
} from '@vaultstone/api';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Campaign = Database['public']['Tables']['campaigns']['Row'];

const RULESETS = [
  {
    system: 'dnd5e',
    srdVersion: 'SRD_2.0' as const,
    label: 'D&D 5e',
    year: '2024',
    subtitle: 'SRD 2024',
    blurb: 'Updated rules. 10 species, 14 backgrounds, origin feats.',
    tag: 'Recommended',
  },
  {
    system: 'dnd5e',
    srdVersion: 'SRD_5.1' as const,
    label: 'D&D 5e',
    year: '2014',
    subtitle: 'SRD 2014',
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
    selectedPackIds, setSelectedPackIds,
  } =
    useCharacterDraftStore(
      useShallow((s) => ({
        srdVersion: s.srdVersion,
        setRuleset: s.setRuleset,
        campaignId: s.campaignId,
        setCampaignId: s.setCampaignId,
        rulesetMode: s.rulesetMode,
        setRulesetMode: s.setRulesetMode,
        selectedPackIds: s.selectedPackIds,
        setSelectedPackIds: s.setSelectedPackIds,
      }))
    );

  function togglePack(packId: string) {
    if (selectedPackIds.includes(packId)) {
      setSelectedPackIds(selectedPackIds.filter((id) => id !== packId));
    } else {
      setSelectedPackIds([...selectedPackIds, packId]);
    }
  }

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
    // Campaigns own their pack set via campaign_packs; the standalone
    // selection isn't relevant once linked. Clearing it avoids carrying
    // a stale selection back into a future standalone wizard if the
    // user flips modes mid-flow.
    setSelectedPackIds([]);
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

  // The wizard parent's bootstrap effect explicitly sets rulesetMode
  // when launching with ?campaignId=, and the bootstrapping flag keeps
  // this component unmounted until that finishes — so we can read the
  // store value directly. (Earlier code derived a fallback from
  // `campaignId ? 'campaign' : null` to cover a phantom race window;
  // that fallback also caught users with a persisted draft from an
  // earlier session and dumped them into campaign mode without the
  // fork screen ever showing — yanked.)
  const effectiveMode: RulesetMode = rulesetMode;

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
          selectedPackIds={selectedPackIds}
          onBack={backToChoice}
          onPick={(r) => setRuleset(r.system, r.srdVersion)}
          onTogglePack={togglePack}
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

      {/* ── Campaign summary (only after a selection — reads as a
          confirmation, not a choice) ──────────────────────────────────── */}
      {linkedCampaign && lockedRuleset ? (
        <CampaignSummary
          campaign={linkedCampaign}
          ruleset={lockedRuleset}
        />
      ) : null}
    </View>
  );
}

// ── Campaign summary ─────────────────────────────────────────────────────
//
// Renders only after the user picks a campaign. Replaces the earlier
// dimmed-card-pair UI which read as a ruleset choice; this version is
// purely informational — "this campaign uses X ruleset and N homebrew
// packs". The pack list reflects which packs the DM toggled on; disabled
// packs are filtered out so the player only sees what's actually in play.

function CampaignSummary({
  campaign,
  ruleset,
}: {
  campaign: Campaign;
  ruleset: Ruleset;
}) {
  type AttachedPack = {
    pack_id: string;
    enabled: boolean;
    homebrew_packs: { id: string; name: string; description: string | null };
  };
  const [packs, setPacks] = useState<AttachedPack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCampaignPacks(campaign.id).then(({ data }) => {
      if (cancelled) return;
      const enabled = ((data as unknown as AttachedPack[]) ?? []).filter((p) => p.enabled);
      setPacks(enabled);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaign.id]);

  return (
    <View style={[s.section, { marginTop: spacing.lg }]}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionLabel}>This campaign uses</Text>
      </View>

      {/* Ruleset row */}
      <View style={s.summaryRow}>
        <View style={s.summaryIcon}>
          <Text style={s.summaryIconText}>📘</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.summaryRowLabel}>Ruleset</Text>
          <Text style={s.summaryRowValue}>
            {ruleset.label} {ruleset.year}
            <Text style={s.summaryRowMeta}> · {ruleset.subtitle}</Text>
          </Text>
        </View>
      </View>

      {/* Homebrew packs row */}
      <View style={s.summaryRow}>
        <View style={s.summaryIcon}>
          <Text style={s.summaryIconText}>📦</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.summaryRowLabel}>Homebrew packs</Text>
          {loading ? (
            <Text style={s.summaryRowMeta}>Loading…</Text>
          ) : packs.length === 0 ? (
            <Text style={s.summaryRowMeta}>None — SRD content only</Text>
          ) : (
            <View style={s.packList}>
              {packs.map((p) => (
                <View key={p.pack_id} style={s.packItem}>
                  <Text style={s.packName}>{p.homebrew_packs.name}</Text>
                  {p.homebrew_packs.description ? (
                    <Text style={s.packDesc} numberOfLines={1}>
                      {p.homebrew_packs.description}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
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

// ── Standalone mode: ruleset cards + optional homebrew pack picker ───────
//
// Standalone characters don't inherit content from a campaign, so the user
// has to opt in explicitly to which of their personal homebrew packs (if
// any) should be available during the wizard. We surface a multi-select
// list of the user's packs filtered to the chosen ruleset's edition. If
// the user has no packs for that edition, the section hides entirely so
// the screen stays tidy.

const SRD_VERSION_TO_SYSTEM_ID: Record<'SRD_5.1' | 'SRD_2.0', string[]> = {
  // The legacy 'dnd5e' system id was the 2024 default before the 5.1/5.2
  // split shipped, so packs tagged 'dnd5e' show up alongside 'dnd5e_2024'
  // for the 2024 ruleset.
  'SRD_5.1': ['dnd5e_2014'],
  'SRD_2.0': ['dnd5e', 'dnd5e_2024'],
};

function StandaloneModeScreen({
  srdVersion,
  selectedPackIds,
  onBack,
  onPick,
  onTogglePack,
}: {
  srdVersion: 'SRD_5.1' | 'SRD_2.0';
  selectedPackIds: string[];
  onBack: () => void;
  onPick: (r: Ruleset) => void;
  onTogglePack: (id: string) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [packs, setPacks] = useState<HomebrewPackRow[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);

  // Fetch the user's packs once, then filter client-side per srdVersion.
  // Packs are RLS-scoped to owner already, but we double-filter on
  // owner_user_id so a user who's also a campaign member doesn't see
  // shared campaign-scoped packs leak into their personal options.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listHomebrewPacks().then(({ data }) => {
      if (cancelled) return;
      setPacks((data ?? []).filter((p) => p.owner_user_id === user.id));
      setLoadingPacks(false);
    });
    return () => { cancelled = true; };
  }, [user]);

  const compatibleSystems = SRD_VERSION_TO_SYSTEM_ID[srdVersion];
  const eligiblePacks = useMemo(
    () => packs.filter((p) => compatibleSystems.includes(p.system)),
    [packs, srdVersion],
  );

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

      {/* Homebrew pack picker — only renders when the user has at least
          one pack tagged for the selected ruleset's edition. */}
      {!loadingPacks && eligiblePacks.length > 0 ? (
        <View style={[s.section, { marginTop: spacing.lg }]}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionLabel}>Homebrew Packs</Text>
            <Text style={s.sectionMeta}>Optional</Text>
          </View>
          <Text style={s.guidance}>
            Pick which of your packs apply. Their species, classes, items, and
            spells will show alongside the SRD options in the wizard.
          </Text>
          <View style={s.standalonePackList}>
            {eligiblePacks.map((p) => {
              const checked = selectedPackIds.includes(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[s.standalonePackRow, checked && s.standalonePackRowSelected]}
                  onPress={() => onTogglePack(p.id)}
                  activeOpacity={0.85}
                >
                  <View style={[s.standalonePackCheck, checked && s.standalonePackCheckOn]}>
                    {checked ? <Text style={s.standalonePackCheckMark}>✓</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.standalonePackName}>{p.name}</Text>
                    {p.description ? (
                      <Text style={s.standalonePackDesc} numberOfLines={2}>
                        {p.description}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
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

  // Campaign summary (post-selection confirmation)
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  summaryIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryContainer + '33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconText: {
    fontSize: 16,
  },
  summaryRowLabel: {
    fontSize: 10,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.outline,
    marginBottom: 2,
  },
  summaryRowValue: {
    fontSize: 14,
    fontFamily: fonts.headline,
    fontWeight: '600',
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  summaryRowMeta: {
    fontSize: 12,
    fontFamily: fonts.body,
    fontWeight: '400',
    color: colors.onSurfaceVariant,
    letterSpacing: 0,
  },
  packList: {
    gap: 4,
    marginTop: 2,
  },
  packItem: {
    paddingVertical: 2,
  },
  packName: {
    fontSize: 13,
    fontFamily: fonts.body,
    fontWeight: '600',
    color: colors.onSurface,
  },
  packDesc: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
  },

  // Standalone-mode pack picker — checkbox-style rows so multi-select
  // reads obviously distinct from the campaign-mode radio rows above.
  standalonePackList: {
    gap: 6,
  },
  standalonePackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  standalonePackRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceContainerHigh,
  },
  standalonePackCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  standalonePackCheckOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  standalonePackCheckMark: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  standalonePackName: {
    fontSize: 14,
    fontFamily: fonts.headline,
    fontWeight: '600',
    color: colors.onSurface,
    letterSpacing: -0.2,
  },
  standalonePackDesc: {
    fontSize: 12,
    fontFamily: fonts.body,
    color: colors.onSurfaceVariant,
    marginTop: 2,
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
