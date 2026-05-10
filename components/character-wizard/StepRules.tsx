// Character-creation rules step. Mounted right after Ruleset (which
// covers system + content pack picks) so the player sees the rule
// posture before any content selection. Two modes:
//
//   • Campaign-launched — read-only preview. The DM picked the rules,
//     player just confirms what they're playing under.
//   • Standalone — editable controls for the rules with creation-time
//     effect. Edits write back to the draft's `campaignRules` bag, so
//     downstream steps (StepFeats gated by feats_at_level_1, StepClass
//     filtering optional_class_features, etc.) pick up the changes
//     when the wizard transitions.
//
// Only rules with actual creation-time consequence are surfaced.
// Rules whose effect kicks in at the table or on level-up
// (advancement_type, encumbrance, multiclassing, starting_level > 1)
// are filtered out so the player isn't asked to commit to toggles
// whose effect they can't see in the wizard.

import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { useShallow } from 'zustand/react/shallow';
import { BUNDLED_SYSTEMS_BY_ID } from '@vaultstone/systems';
import {
  Card, MetaLabel, Text,
  colors, fonts, radius, spacing,
} from '@vaultstone/ui';
import type { OptionalRule } from '@vaultstone/types';

// Whitelist of rule keys that affect the wizard's behavior at
// creation time. Order here drives display order.
const CREATION_TIME_RULES: ReadonlyArray<string> = [
  'feats_at_level_1',
  'enforce_feat_prerequisites',
  'customize_origin',
  'optional_class_features',
  'hit_point_method',
  'ability_score_method',
];

export function StepRules() {
  const {
    system, campaignId, campaignRules, setCampaignRules,
  } = useCharacterDraftStore(
    useShallow((s) => ({
      system: s.system,
      campaignId: s.campaignId,
      campaignRules: s.campaignRules,
      setCampaignRules: s.setCampaignRules,
    })),
  );

  const sys = BUNDLED_SYSTEMS_BY_ID[system];
  const rules = useMemo<OptionalRule[]>(() => {
    if (!sys) return [];
    const lookup = new Map<string, OptionalRule>(
      sys.optionalRules.map((r) => [r.key, r]),
    );
    return CREATION_TIME_RULES
      .map((key) => lookup.get(key))
      .filter((r): r is OptionalRule => !!r);
  }, [sys]);

  // For standalone wizards the bootstrap leaves the rules bag empty
  // (no campaign means nothing to inherit). Seed it from the system
  // defaults on first mount so the editable controls have values to
  // show and downstream steps that read the bag don't fall through
  // to defaults until the player touches each toggle.
  const isCampaign = !!campaignId;
  useEffect(() => {
    if (isCampaign) return;
    const missing = rules.some((r) => campaignRules[r.key] === undefined);
    if (!missing) return;
    const next: Record<string, boolean | string | number> = { ...campaignRules };
    for (const r of rules) {
      if (next[r.key] === undefined && r.default !== undefined) {
        next[r.key] = r.default;
      }
    }
    setCampaignRules(next);
  }, [isCampaign, rules, campaignRules, setCampaignRules]);

  function setRule(key: string, value: boolean | string | number) {
    setCampaignRules({ ...campaignRules, [key]: value });
  }

  if (!sys || rules.length === 0) {
    return null;
  }

  return (
    <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>
        {isCampaign ? 'Campaign rules' : 'Character creation rules'}
      </Text>
      <Text style={s.guidance}>
        {isCampaign
          ? "These rules are set by the DM. They shape the rest of the wizard — what feats are available, whether you can swap species traits, and so on."
          : "These rules shape the rest of the wizard — what feats are available, whether you can swap species traits, and so on. You can change them now or stick with the system defaults."}
      </Text>

      <View style={s.list}>
        {rules.map((rule) => (
          <RuleRow
            key={rule.key}
            rule={rule}
            value={campaignRules[rule.key] ?? rule.default}
            readOnly={isCampaign}
            onChange={(v) => setRule(rule.key, v)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function RuleRow({
  rule, value, readOnly, onChange,
}: {
  rule: OptionalRule;
  value: boolean | string | number | undefined;
  readOnly: boolean;
  onChange: (next: boolean | string | number) => void;
}) {
  return (
    <Card tier="container" padding="md" style={s.row}>
      <View style={s.rowHeader}>
        <View style={{ flex: 1 }}>
          <MetaLabel size="sm">{rule.label}</MetaLabel>
          <Text variant="body-sm" family="body" style={s.description}>
            {rule.description}
          </Text>
        </View>
      </View>
      <View style={s.control}>
        {rule.type === 'boolean' ? (
          <BooleanControl
            value={value === undefined ? !!rule.default : !!value}
            readOnly={readOnly}
            onChange={onChange}
          />
        ) : rule.type === 'choice' ? (
          <ChoiceControl
            choices={rule.choices ?? []}
            value={typeof value === 'string' ? value : String(rule.default ?? '')}
            readOnly={readOnly}
            onChange={onChange}
          />
        ) : (
          <Text style={s.staticValue}>{String(value ?? '—')}</Text>
        )}
      </View>
    </Card>
  );
}

function BooleanControl({
  value, readOnly, onChange,
}: {
  value: boolean;
  readOnly: boolean;
  onChange: (next: boolean) => void;
}) {
  if (readOnly) {
    return <Text style={s.readOnlyValue}>{value ? 'On' : 'Off'}</Text>;
  }
  return (
    <View style={s.segmented}>
      {[
        { key: true, label: 'On' },
        { key: false, label: 'Off' },
      ].map((opt) => {
        const selected = value === opt.key;
        return (
          <TouchableOpacity
            key={String(opt.key)}
            style={[s.segment, selected && s.segmentSelected]}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.85}
          >
            <Text style={[s.segmentText, selected && s.segmentTextSelected]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ChoiceControl({
  choices, value, readOnly, onChange,
}: {
  choices: NonNullable<OptionalRule['choices']>;
  value: string;
  readOnly: boolean;
  onChange: (next: string) => void;
}) {
  if (readOnly) {
    const match = choices.find((c) => c.key === value);
    return <Text style={s.readOnlyValue}>{match?.label ?? value}</Text>;
  }
  return (
    <View style={s.segmented}>
      {choices.map((c) => {
        const selected = value === c.key;
        return (
          <TouchableOpacity
            key={c.key}
            style={[s.segment, selected && s.segmentSelected]}
            onPress={() => onChange(c.key)}
            activeOpacity={0.85}
          >
            <Text style={[s.segmentText, selected && s.segmentTextSelected]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  title: {
    fontSize: 26, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.5, marginTop: 12, marginBottom: 8, lineHeight: 30,
  },
  guidance: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 19, marginBottom: 16,
  },
  list: { gap: spacing.sm },
  row: { gap: spacing.sm },
  rowHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  description: {
    color: colors.onSurfaceVariant, marginTop: 2, lineHeight: 17,
  },
  control: { marginTop: spacing.xs },
  staticValue: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
  },
  readOnlyValue: {
    fontSize: 13, fontFamily: fonts.body, fontWeight: '600',
    color: colors.primary, letterSpacing: 0.2,
  },
  segmented: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 4,
  },
  segment: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  segmentSelected: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  segmentText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, color: colors.onSurfaceVariant,
  },
  segmentTextSelected: { color: colors.primary },
});
