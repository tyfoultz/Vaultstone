import { View, StyleSheet } from 'react-native';
import { colors, spacing, radius, Text, MetaLabel, MarkdownText } from '@vaultstone/ui';
import type { CreatureResult } from '@vaultstone/types';
import {
  parseSpellcastingTrait,
  extractAllSpellNames,
  isSpellcastingTrait,
} from './parseSpellcastingTrait';
import { SpellTooltip } from './SpellTooltip';

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function skillLabel(key: string): string {
  return key
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function AbilityBlock({ scores, mods, saves }: {
  scores: NonNullable<CreatureResult['abilityScores']>;
  mods: NonNullable<CreatureResult['abilityModifiers']>;
  saves?: CreatureResult['savingThrows'];
}) {
  type AbKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  const rows: Array<[AbKey, string, number, number]> = [
    ['str', 'STR', scores.str, mods.str],
    ['dex', 'DEX', scores.dex, mods.dex],
    ['con', 'CON', scores.con, mods.con],
    ['int', 'INT', scores.int, mods.int],
    ['wis', 'WIS', scores.wis, mods.wis],
    ['cha', 'CHA', scores.cha, mods.cha],
  ];
  return (
    <View style={s.abilityTable}>
      <View style={[s.abilityRow, s.abilityHeadRow]}>
        <Text variant="label-sm" weight="bold" uppercase style={[s.abilityCell, s.abilityNameCol, s.abilityHeadText]}>
          {' '}
        </Text>
        <Text variant="label-sm" weight="bold" uppercase style={[s.abilityCell, s.abilityNumCol, s.abilityHeadText]}>
          Score
        </Text>
        <Text variant="label-sm" weight="bold" uppercase style={[s.abilityCell, s.abilityNumCol, s.abilityHeadText]}>
          Modifier
        </Text>
        <Text variant="label-sm" weight="bold" uppercase style={[s.abilityCell, s.abilityNumCol, s.abilityHeadText]}>
          Save
        </Text>
      </View>
      {rows.map(([key, label, score, mod], i) => {
        const saveBonus = saves?.[key];
        return (
          <View
            key={key}
            style={[s.abilityRow, i === rows.length - 1 && s.abilityRowLast]}
          >
            <Text variant="label-sm" weight="bold" uppercase style={[s.abilityCell, s.abilityNameCol, s.abilityNameText]}>
              {label}
            </Text>
            <Text variant="body-sm" family="body" style={[s.abilityCell, s.abilityNumCol, s.abilityValueText]}>
              {score}
            </Text>
            <Text variant="body-sm" family="body" style={[s.abilityCell, s.abilityNumCol, s.abilityValueText]}>
              {fmtSigned(mod)}
            </Text>
            <Text
              variant="body-sm"
              family="body"
              style={[
                s.abilityCell,
                s.abilityNumCol,
                typeof saveBonus === 'number' ? s.abilitySaveText : s.abilityDashText,
              ]}
            >
              {typeof saveBonus === 'number' ? fmtSigned(saveBonus) : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function LineRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statRow}>
      <Text variant="label-sm" weight="bold" uppercase style={s.statLabel}>{label}</Text>
      <Text variant="body-sm" family="body" style={s.statValue}>{value}</Text>
    </View>
  );
}

function SpellcastingDescription({ description }: { description: string }) {
  const tiers = parseSpellcastingTrait(description);
  if (tiers.length === 0) {
    return <MarkdownText style={s.bodyText}>{description}</MarkdownText>;
  }

  const allSpellNames = extractAllSpellNames(description);
  const lines = description.split('\n');

  return (
    <View style={{ gap: 2 }}>
      {lines.map((line, li) => {
        const matches: Array<{ index: number; length: number; name: string }> = [];
        for (const name of allSpellNames) {
          const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
          let m: RegExpExecArray | null;
          while ((m = regex.exec(line)) !== null) {
            matches.push({ index: m.index, length: m[0].length, name: m[0] });
          }
        }
        if (matches.length === 0) {
          return (
            <Text key={li} variant="body-sm" family="body" style={s.bodyText}>
              {line}
            </Text>
          );
        }
        // Earliest first; on a tie the longest name wins so "fire shield"
        // isn't shadowed by a shorter spell starting at the same offset.
        matches.sort((a, b) => a.index - b.index || b.length - a.length);
        const parts: React.ReactNode[] = [];
        let cursor = 0;
        for (let i = 0; i < matches.length; i++) {
          const { index, length, name } = matches[i];
          if (index < cursor) continue;
          if (index > cursor) parts.push(line.slice(cursor, index));
          parts.push(
            <SpellTooltip key={`${li}-${i}`} spellName={name}>
              {name}
            </SpellTooltip>,
          );
          cursor = index + length;
        }
        if (cursor < line.length) parts.push(line.slice(cursor));
        return (
          <Text key={li} variant="body-sm" family="body" style={s.bodyText}>
            {parts}
          </Text>
        );
      })}
    </View>
  );
}

export function BehaviorSection({
  label,
  entries,
}: {
  label: string;
  entries: ReadonlyArray<{ name: string; description: string }>;
}) {
  return (
    <View style={s.behaviorSection}>
      <MetaLabel size="sm">{label}</MetaLabel>
      {entries.map((e, i) => (
        <View key={i} style={s.behaviorEntry}>
          <Text variant="body-sm" family="body" style={s.bodyText}>
            <Text weight="bold" family="body" style={{ color: colors.onSurface }}>
              {e.name}.
            </Text>{' '}
          </Text>
          {isSpellcastingTrait(e.name) ? (
            <SpellcastingDescription description={e.description} />
          ) : (
            <MarkdownText style={s.bodyText}>{e.description}</MarkdownText>
          )}
        </View>
      ))}
    </View>
  );
}

export function CreatureStatBlock({ creature }: { creature: CreatureResult }) {
  const c = creature;
  const skillsText = c.skills
    ? Object.entries(c.skills)
        .map(([k, v]) => `${skillLabel(k)} ${fmtSigned(v as number)}`)
        .join(', ')
    : '';
  const sensesParts: string[] = [];
  if (c.senses?.darkvision) sensesParts.push(`darkvision ${c.senses.darkvision} ft.`);
  if (c.senses?.blindsight) sensesParts.push(`blindsight ${c.senses.blindsight} ft.`);
  if (c.senses?.tremorsense) sensesParts.push(`tremorsense ${c.senses.tremorsense} ft.`);
  if (c.senses?.truesight) sensesParts.push(`truesight ${c.senses.truesight} ft.`);
  if (typeof c.senses?.passivePerception === 'number') sensesParts.push(`passive Perception ${c.senses.passivePerception}`);
  const sensesText = sensesParts.join(', ');
  const challengeText = (() => {
    const cr = c.challengeRating;
    if (cr == null || cr === '') return '';
    const xp = typeof c.xp === 'number' ? ` (${c.xp.toLocaleString()} XP)` : '';
    return `${cr}${xp}`;
  })();

  return (
    <>
      <View style={s.statTable}>
        {c.size ? <LineRow label="Size" value={c.size} /> : null}
        {c.creatureType ? <LineRow label="Type" value={c.creatureType} /> : null}
        {c.alignment ? <LineRow label="Alignment" value={c.alignment} /> : null}
        {challengeText ? <LineRow label="Challenge" value={challengeText} /> : null}
        {skillsText ? <LineRow label="Skills" value={skillsText} /> : null}
        {sensesText ? <LineRow label="Senses" value={sensesText} /> : null}
        {c.languages ? <LineRow label="Languages" value={c.languages} /> : null}
      </View>

      {c.abilityScores && c.abilityModifiers ? (
        <View style={s.subBlock}>
          <AbilityBlock
            scores={c.abilityScores}
            mods={c.abilityModifiers}
            saves={c.savingThrows}
          />
        </View>
      ) : null}

      <View style={s.statTable}>
        <LineRow label="AC" value={c.armorDetail ? `${c.ac} (${c.armorDetail})` : `${c.ac}`} />
        <LineRow label="HP" value={c.hitDice ? `${c.hp} (${c.hitDice})` : `${c.hp}`} />
        {c.speed ? <LineRow label="Speed" value={c.speed} /> : null}
        {typeof c.proficiencyBonus === 'number' ? <LineRow label="Prof" value={fmtSigned(c.proficiencyBonus)} /> : null}
        {c.damageResistances?.length ? <LineRow label="Resist" value={c.damageResistances.join(', ')} /> : null}
        {c.damageImmunities?.length ? <LineRow label="Immune" value={c.damageImmunities.join(', ')} /> : null}
        {c.damageVulnerabilities?.length ? <LineRow label="Vuln" value={c.damageVulnerabilities.join(', ')} /> : null}
        {c.conditionImmunities?.length ? <LineRow label="Cond Imm" value={c.conditionImmunities.join(', ')} /> : null}
      </View>

      {c.traits?.length ? (
        <BehaviorSection label="Traits" entries={c.traits} />
      ) : null}
      {c.actions?.length ? (
        <BehaviorSection label="Actions" entries={c.actions} />
      ) : null}
    </>
  );
}

const s = StyleSheet.create({
  bodyText: { color: colors.onSurfaceVariant, lineHeight: 20 },
  subBlock: { gap: 6, marginTop: spacing.xs + 2 },

  statTable: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '88',
  },
  statRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    gap: spacing.md,
    alignItems: 'baseline',
  },
  statLabel: {
    width: 84,
    color: colors.outline,
    letterSpacing: 1,
  },
  statValue: {
    flex: 1,
    color: colors.onSurface,
  },

  behaviorSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.outlineVariant + '66',
    gap: spacing.xs,
  },
  behaviorEntry: {
    marginTop: spacing.xs,
    gap: 2,
  },

  abilityTable: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainer,
  },
  abilityRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '55',
  },
  abilityRowLast: { borderBottomWidth: 0 },
  abilityHeadRow: { backgroundColor: colors.surfaceContainerHigh },
  abilityCell: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.xs,
  },
  abilityNameCol: { width: 64 },
  abilityNumCol: { flex: 1, textAlign: 'center' },
  abilityHeadText: {
    color: colors.outline,
    letterSpacing: 1,
  },
  abilityNameText: {
    color: colors.outline,
    letterSpacing: 1,
  },
  abilityValueText: { color: colors.onSurface },
  abilitySaveText: { color: colors.primary },
  abilityDashText: { color: colors.outline },
});
