// Compact party-member card for the campaign hub's PartyPanel. Renders
// one character's at-a-glance vitals: HP bar (with temp HP pill), a
// shield-shaped AC badge top-right, passive PER/INV/INS strip, and
// active conditions / concentration. The design follows
// docs/mockups/party-view-cards.html — accent stripe on the left
// edge, 3:4 portrait, dense vitals stack on the right.
//
// Live updates: the parent loads the full campaign character roster via
// `getCharactersForCampaign` and subscribes to Supabase Realtime for
// `characters` UPDATE events so this component re-renders on HP /
// condition / concentration changes without a manual refetch.

import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSplitPaneStore } from '@vaultstone/store';
import { getEquippedAC } from '@vaultstone/systems';
import { colors, spacing, fonts, Icon } from '@vaultstone/ui';
import type {
  Dnd5eStats, Dnd5eResources,
} from '@vaultstone/types';
import { useResolvedContentLabels, composeIdentity } from './useResolvedContentLabels';

type Props = {
  /** Display name (player profile name, falls back to "Unknown"). */
  playerName: string;
  /** Character row data — full payload from `getCharactersForCampaign`. */
  character: {
    id: string;
    name: string;
    base_stats: unknown;
    resources: unknown;
    conditions: string[] | null;
    avatar_url: string | null;
    avatar_card_url: string | null;
  };
  /** Campaign the character belongs to. Used to scope the homebrew-content
   *  name lookup so `homebrew_<uuid>` keys render as the user's actual
   *  species/class/background name instead of the row id. */
  campaignId?: string | null;
  /** When true, tapping the card opens the full character sheet. DMs
   *  see this for every party card; players only see it for their own.
   *  When false, the card renders read-only (party stats stay visible
   *  but the tap is suppressed) — keeps party at-a-glance HP/conditions
   *  for everyone without exposing the full sheet to other players. */
  canOpen?: boolean;
};

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }

// AC math lives in @vaultstone/systems — shared with the character
// sheet so the party card, campaign party tab, and world home all
// show the same number for the same equipment.
const computeAc = getEquippedAC;

/**
 * Coarse HP tier — only used to flag `unconscious` for the
 * card-background tint and the death-saves row swap. Fine-grained
 * color now flows through `hpBarColor` (5-tier gradient shared with
 * the character sheet).
 */
function hpTier(current: number, max: number): 'healthy' | 'bloodied' | 'dying' | 'unconscious' {
  if (max <= 0 || current === 0) return 'unconscious';
  const ratio = current / max;
  if (ratio > 0.5) return 'healthy';
  if (ratio > 0.25) return 'bloodied';
  return 'dying';
}

/**
 * Five-tier HP gradient — mirrors the character sheet's `hpColor` so
 * the party panel and the sheet read consistently. Drives both the
 * left accent stripe and the HP-bar fill. Bands:
 *   >=100% green | >75% yellow-green | >50% yellow | >25% orange | <=25% red
 */
function hpBarColor(current: number, max: number): string {
  if (max <= 0) return colors.hpDanger;
  if (current === 0) return colors.hpDanger;
  const ratio = current / max;
  if (ratio >= 1) return colors.hpHealthy;
  if (ratio > 0.75) return '#A3D977';
  if (ratio > 0.5) return colors.hpWarning;
  if (ratio > 0.25) return '#F97316';
  return colors.hpDanger;
}

/** Two-letter shorthand from a character name, for the portrait fallback. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function PartyMemberCard({
  playerName: _playerName, character, campaignId, canOpen = true,
}: Props) {
  const openSplit = useSplitPaneStore((s) => s.openSplit);
  const stats = character.base_stats as Dnd5eStats | null;
  const resources = character.resources as Dnd5eResources | null;
  const { speciesLabel, classLabel, subclassLabel } = useResolvedContentLabels(stats, { campaignId });

  if (!stats || !resources) {
    return (
      <View style={[s.card, { minHeight: 140 }]}>
        <Text style={s.name}>{character.name}</Text>
        <Text style={s.fallback}>Character data unavailable.</Text>
      </View>
    );
  }

  const hpCurrent = resources.hpCurrent ?? 0;
  const hpMax = stats.hpMax ?? 0;
  const hpTemp = resources.hpTemp ?? 0;
  const tier = hpTier(hpCurrent, hpMax);
  const barColor = hpBarColor(hpCurrent, hpMax);
  const stripeColor = barColor;
  const hpBarPct = hpMax > 0 ? Math.max(0, Math.min(1, hpCurrent / hpMax)) : 0;

  const ac = computeAc(stats, resources);

  const level = stats.level ?? 1;

  // Passive senses — 10 + ability mod + (prof bonus if proficient).
  // Skill proficiency is tracked on stats.skillProficiencies (lowercase).
  const wisMod = abilityMod(stats.abilityScores.wisdom);
  const intMod = abilityMod(stats.abilityScores.intelligence);
  const profBonus = Math.floor((level - 1) / 4) + 2;
  const profs = (stats.skillProficiencies ?? []).map((sk) => sk.toLowerCase());
  const passive = (mod: number, skill: string) =>
    10 + mod + (profs.includes(skill) ? profBonus : 0);
  const passivePer = passive(wisMod, 'perception');
  const passiveInv = passive(intMod, 'investigation');
  const passiveIns = passive(wisMod, 'insight');

  // Subtitle reads like "L3 - Owlin Champion Fighter": level first,
  // then species + (subclass) + class. Background is intentionally
  // dropped — the at-a-glance subtitle prioritizes combat-relevant
  // identity, and background is one tap away in the character sheet's
  // Lore tab.
  const identity = composeIdentity(speciesLabel, subclassLabel, classLabel);
  const subtitle = [
    `L${level}`,
    identity || null,
  ].filter((part) => part && part.length > 0).join(' - ');

  // Death-save pips when unconscious — read off resources.deathSaves
  // if present, otherwise zero. The shape is `{ successes, failures }`.
  type DeathSaves = { successes?: number; failures?: number };
  const deathSaves: DeathSaves = (resources.deathSaves as DeathSaves) ?? {};
  const succ = Math.max(0, Math.min(3, deathSaves.successes ?? 0));
  const fail = Math.max(0, Math.min(3, deathSaves.failures ?? 0));

  // Active state chips — concentration first, then conditions. Death
  // saves replace the condition row when unconscious.
  const conditions = character.conditions ?? [];
  // Exhaustion is tracked separately on resources (level 0–6) rather
  // than as a string in conditions[], so we render it as its own chip
  // alongside the regular condition list when level > 0.
  const exhaustionLevel = resources.exhaustionLevel ?? 0;

  return (
    <TouchableOpacity
      style={[
        s.card,
        tier === 'unconscious' ? s.cardUnconscious : null,
      ]}
      onPress={canOpen
        // Open the sheet in a new tab on the focused side (next to
        // the campaign tab) so the route stays full-screen. The user
        // can drag the tab across to opt into split view.
        ? () => openSplit({ kind: 'character', characterId: character.id }, { preferSide: 'focused' })
        : undefined}
      activeOpacity={canOpen ? 0.85 : 1}
      disabled={!canOpen}
    >
      {/* Left-edge accent stripe — color-codes HP tier */}
      <View style={[s.stripe, { backgroundColor: stripeColor }]} />

      {/* Shield-wrapped AC badge, top-right of the card. The shield
          glyph is masked with a static brand gradient (primary →
          primary-container) — keeps the AC visually distinct from the
          HP gradient so it reads as a defense stat at a glance. */}
      <View style={s.acBadge}>
        <MaskedView
          style={s.acShieldMask}
          maskElement={
            <View style={s.acShieldMaskInner}>
              <Icon name="shield" size={36} color="#000" />
            </View>
          }
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryContainer]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.acShieldGradient}
          />
        </MaskedView>
        <Text style={s.acBadgeNum}>{ac}</Text>
      </View>

      {/* 3:4 portrait box */}
      <View style={s.portrait}>
        {character.avatar_card_url || character.avatar_url ? (
          <Image
            source={{ uri: character.avatar_card_url ?? character.avatar_url ?? '' }}
            style={s.portraitImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={s.portraitInitials}>{initials(character.name)}</Text>
        )}
      </View>

      {/* Body column — right-padded to clear the AC badge */}
      <View style={s.body}>
        <Text style={[s.name, s.namePad]} numberOfLines={1}>{character.name}</Text>

        {subtitle ? (
          <Text style={[s.sub, s.namePad]} numberOfLines={1}>{subtitle}</Text>
        ) : null}

        {/* HP block */}
        <View style={s.hpBlock}>
          <View style={s.hpRow}>
            <View style={s.hpNumWrap}>
              <Text style={s.hpNum}>{hpCurrent}</Text>
              <Text style={s.hpMax}>{` / ${hpMax}`}</Text>
            </View>
            {hpTemp > 0 ? (
              <View style={s.tempPill}>
                <Text style={s.tempPillText}>{`+${hpTemp} TEMP`}</Text>
              </View>
            ) : null}
          </View>
          <View style={s.hpBarTrack}>
            <View style={[s.hpBarFill, { width: `${hpBarPct * 100}%`, backgroundColor: barColor }]} />
          </View>
        </View>

        {/* Passive senses strip — Perception / Investigation / Insight.
            AC moved to the shield badge top-right; passives are the
            second-most-asked stats at the table after HP. */}
        <View style={s.statsRow}>
          <StatCell label="PER" value={passivePer} />
          <StatCell label="INV" value={passiveInv} />
          <StatCell label="INS" value={passiveIns} />
        </View>

        {/* Status row — death saves when unconscious, otherwise
            concentration / inspiration / conditions / exhaustion.
            Always rendered (even when empty) so the card height
            stays constant across roster states; an empty row reserves
            the slot via minHeight. */}
        {tier === 'unconscious' ? (
          <View style={s.deathSavesRow}>
            <View style={s.deathSavesGroup}>
              <Text style={s.deathSavesLabel}>SUCC</Text>
              {[0, 1, 2].map((i) => (
                <View key={`s-${i}`} style={[s.dpip, i < succ && s.dpipSuccess]} />
              ))}
            </View>
            <View style={s.deathSavesGroup}>
              <Text style={s.deathSavesLabel}>FAIL</Text>
              {[0, 1, 2].map((i) => (
                <View key={`f-${i}`} style={[s.dpip, i < fail && s.dpipFailure]} />
              ))}
            </View>
          </View>
        ) : (
          <View style={s.chipsRow}>
            {resources.concentrationSpell ? (
              <View style={[s.chip, s.chipConcentrate]}>
                <Text style={[s.chipText, s.chipTextConcentrate]}>
                  ✦ {resources.concentrationSpell.toUpperCase()}
                </Text>
              </View>
            ) : null}
            {resources.inspiration ? (
              <View style={[s.chip, s.chipInspire]}>
                <Text style={[s.chipText, s.chipTextInspire]}>★ INSP</Text>
              </View>
            ) : null}
            {conditions.map((c, i) => (
              <View key={`${c}-${i}`} style={[s.chip, s.chipCondition]}>
                <Text style={[s.chipText, s.chipTextCondition]}>{c.toUpperCase()}</Text>
              </View>
            ))}
            {exhaustionLevel > 0 ? (
              <View style={[s.chip, s.chipCondition]}>
                <Text style={[s.chipText, s.chipTextCondition]}>{`EXHAUSTION ${exhaustionLevel}`}</Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function StatCell({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statCellLabel}>{label}</Text>
      <Text style={s.statCellValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch', // portrait fills card height; body sets that height
    gap: spacing.sm + 4,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.sm + 4,
    paddingLeft: spacing.sm + 8, // extra to clear the left stripe
    paddingRight: spacing.sm + 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    position: 'relative',
    overflow: 'hidden',
  },
  cardUnconscious: {
    borderColor: 'rgba(226,75,74,0.4)',
    backgroundColor: 'rgba(226,75,74,0.06)',
  },
  /** Left-edge accent stripe — color-codes HP tier at a glance. */
  stripe: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
  },

  portrait: {
    aspectRatio: 3 / 4, // width derived from card height — 3:4 locked
    alignSelf: 'stretch', // fill the card's full vertical space
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  portraitImage: { width: '100%', height: '100%' },
  portraitInitials: {
    fontFamily: fonts.headline,
    fontSize: 24,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    letterSpacing: 2,
  },

  body: { flex: 1, minWidth: 0, gap: 6 },

  name: {
    fontFamily: fonts.headline,
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: -0.1,
  },
  /** Extra right padding on the name + subtitle so neither runs under
   *  the absolutely-positioned shield AC badge. */
  namePad: { paddingRight: 44 },

  /** Shield-wrapped AC badge, top-right corner. The shield glyph is
   *  masked over a brand-purple LinearGradient (primary →
   *  primary-container); the AC number is absolutely-stacked on top.
   *  Static gradient keeps the AC visually distinct from the HP
   *  gradient so it reads as a defense stat at a glance. */
  acBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** MaskedView footprint matches the icon's intrinsic 36×36 box so
   *  the gradient fill lines up with the glyph silhouette. */
  acShieldMask: {
    width: 36,
    height: 36,
  },
  acShieldMaskInner: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acShieldGradient: {
    flex: 1,
  },
  acBadgeNum: {
    position: 'absolute',
    top: 12,
    left: 0, right: 0,
    textAlign: 'center',
    fontFamily: fonts.headline,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
  },

  /** One-line ancestry/class/background subtitle. */
  sub: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.outline,
    letterSpacing: 0.2,
  },

  hpBlock: { marginTop: 2 },
  hpRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  hpNumWrap: { flexDirection: 'row', alignItems: 'baseline' },
  hpNum: {
    fontFamily: fonts.headline,
    fontSize: 20,
    fontWeight: '700',
    color: colors.onSurface,
    lineHeight: 22,
  },
  hpMax: {
    fontSize: 12,
    color: colors.outline,
  },
  /** Temp-HP pill — secondary-blue accent. */
  tempPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(173,198,255,0.3)',
    backgroundColor: 'rgba(173,198,255,0.12)',
  },
  tempPillText: {
    fontFamily: fonts.headline,
    fontSize: 10,
    fontWeight: '700',
    color: colors.secondary,
    letterSpacing: 0.4,
  },
  hpBarTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginTop: 6,
  },
  hpBarFill: { height: '100%', borderRadius: 999 },

  /** 3-cell AC / SPD / INIT strip — second-most-asked stats at the table. */
  statsRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  statCellLabel: {
    fontFamily: fonts.label,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.4,
    color: colors.outline,
    textTransform: 'uppercase',
  },
  statCellValue: {
    fontFamily: fonts.headline,
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
    marginTop: 1,
  },

  /** minHeight reserves the row's vertical space when no chips are
   *  present, so card height stays constant whether or not the
   *  character has active conditions / concentration / inspiration.
   *  Matches the rendered chip height (paddingVertical 2 + line ~13
   *  + border 1*2 ≈ 18). */
  chipsRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 4, minHeight: 18 },
  chip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  chipText: {
    fontFamily: fonts.label,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.onSurfaceVariant,
  },
  chipConcentrate: {
    borderColor: 'rgba(211,187,255,0.3)',
    backgroundColor: 'rgba(211,187,255,0.1)',
  },
  chipTextConcentrate: { color: colors.primary },
  chipInspire: {
    borderColor: 'rgba(230,162,85,0.35)',
    backgroundColor: 'rgba(230,162,85,0.12)',
  },
  chipTextInspire: { color: colors.gm },
  chipCondition: {
    borderColor: 'rgba(239,159,39,0.3)',
    backgroundColor: 'rgba(239,159,39,0.1)',
  },
  chipTextCondition: { color: colors.hpWarning },

  /** Death-save pip rows — replace conditions when unconscious. */
  deathSavesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
    alignItems: 'center',
  },
  deathSavesGroup: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  deathSavesLabel: {
    fontFamily: fonts.label,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.outline,
    marginRight: 2,
  },
  dpip: {
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  dpipSuccess: {
    backgroundColor: colors.hpHealthy,
    borderColor: colors.hpHealthy,
  },
  dpipFailure: {
    backgroundColor: colors.hpDanger,
    borderColor: colors.hpDanger,
  },

  fallback: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.outline,
    marginTop: 4,
  },
});
