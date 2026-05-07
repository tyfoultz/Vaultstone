// DM editor for character-creation rules. Reads the system's
// `optionalRules` definition and renders one row per rule with a
// type-appropriate input (boolean toggle, choice picker, number
// stepper). Saves the full resolved value set wholesale on commit.
//
// Players don't see this modal — they read the resolved values from
// the wizard / sheet at runtime via `resolveRuleValues`.

import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  getCampaignCharacterRules,
  resolveRuleValues,
  setCampaignCharacterRules,
  type CharacterCreationRuleValues,
} from '@vaultstone/api';
import {
  Card, GhostButton, GradientButton, Icon, Input, MetaLabel, Text,
  colors, radius, spacing,
} from '@vaultstone/ui';
import type { GameSystemDefinition, OptionalRule } from '@vaultstone/types';

type Props = {
  campaignId: string;
  system: GameSystemDefinition;
  onClose: () => void;
  onSaved?: (values: CharacterCreationRuleValues) => void;
};

export function CharacterCreationRulesModal({ campaignId, system, onClose, onSaved }: Props) {
  // Show campaign-scope and character-scope rules in the editor.
  // The DM is configuring both — campaign-scope are their direct
  // choices, character-scope are the defaults players will see in
  // the wizard (with the DM able to override the system default).
  const allRules = system.optionalRules;
  const [draft, setDraft] = useState<CharacterCreationRuleValues>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getCampaignCharacterRules(campaignId);
      if (cancelled) return;
      setDraft(resolveRuleValues(allRules, data ?? {}));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [campaignId, allRules]);

  async function handleSave() {
    setSaving(true);
    setError('');
    const { error: err } = await setCampaignCharacterRules(campaignId, draft);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved?.(draft);
    onClose();
  }

  // Group by scope so the DM sees campaign-scope (their choices)
  // first, then character-scope (defaults for players' wizards).
  const grouped = useMemo(() => {
    const campaignRules = allRules.filter((r) => r.scope === 'campaign');
    const characterRules = allRules.filter((r) => r.scope === 'character');
    return { campaignRules, characterRules };
  }, [allRules]);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="sm" style={styles.panel}>
            {/* Padding pushed onto the scroll content so we can
                reserve a wider right inset for the scrollbar lane.
                Without this the toggle / chip controls in the right
                column get clipped behind the scrollbar on web. The
                Card's own padding is reduced to 'sm' (the smallest
                valid step) since the scroll content owns the rest. */}
            <ScrollView contentContainerStyle={styles.scrollBody}>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">{system.displayName}</MetaLabel>
                  <Text variant="headline-sm" family="headline" weight="bold" style={{ marginTop: 4 }}>
                    Character creation rules
                  </Text>
                  <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 6 }}>
                    These choices apply to every character built for this campaign.
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              {loading ? (
                <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                  <Text variant="body-sm" style={{ color: colors.outline }}>Loading…</Text>
                </View>
              ) : (
                <>
                  {grouped.campaignRules.length > 0 ? (
                    <RuleGroup
                      title="Campaign settings"
                      caption="DM-set rules that apply to the whole table."
                      rules={grouped.campaignRules}
                      draft={draft}
                      onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
                    />
                  ) : null}
                  {grouped.characterRules.length > 0 ? (
                    <RuleGroup
                      title="Player defaults"
                      caption="Defaults the wizard will use; players can override per character."
                      rules={grouped.characterRules}
                      draft={draft}
                      onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
                    />
                  ) : null}
                </>
              )}

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Cancel" onPress={onClose} />
                <GradientButton
                  label={saving ? 'Saving…' : 'Save rules'}
                  onPress={handleSave}
                  loading={saving}
                  disabled={loading}
                />
              </View>
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RuleGroup({
  title, caption, rules, draft, onChange,
}: {
  title: string;
  caption: string;
  rules: OptionalRule[];
  draft: CharacterCreationRuleValues;
  onChange: (key: string, value: boolean | string | number) => void;
}) {
  // Walk the rules in declared order. A rule with `parentKey` set
  // hides when its parent's value matches `parentHiddenWhen`, and
  // renders indented when shown. The parent-relationship metadata
  // lives on the rule definition, so adding more grouped rules
  // doesn't require modal changes.
  return (
    <View style={styles.group}>
      <View style={{ marginBottom: spacing.sm }}>
        <Text variant="label-sm" weight="bold" uppercase style={styles.groupTitle}>
          {title}
        </Text>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
          {caption}
        </Text>
      </View>
      {rules.map((rule) => {
        // Sub-rules hide entirely when their parent is in a state
        // that makes them irrelevant (e.g. coin weight when
        // encumbrance is Disabled). When shown, they render with
        // the same chrome as any other row.
        if (rule.parentKey) {
          const parentValue = draft[rule.parentKey];
          if (isHiddenByParent(parentValue, rule.parentHiddenWhen)) return null;
        }
        return (
          <RuleRow
            key={rule.key}
            rule={rule}
            value={draft[rule.key] ?? rule.default}
            onChange={(v) => onChange(rule.key, v)}
          />
        );
      })}
    </View>
  );
}

/**
 * Decide whether a sub-rule should be hidden given the parent's
 * current value. Single-value or array `parentHiddenWhen` both
 * supported. Undefined hides nothing — the sub-rule shows whenever
 * its parent has any value.
 */
function isHiddenByParent(
  parentValue: boolean | string | number | undefined,
  hiddenWhen: OptionalRule['parentHiddenWhen'],
): boolean {
  if (hiddenWhen === undefined) return false;
  if (parentValue === undefined) return false;
  if (Array.isArray(hiddenWhen)) {
    return hiddenWhen.some((v) => v === parentValue);
  }
  return hiddenWhen === parentValue;
}

function RuleRow({
  rule, value, onChange,
}: {
  rule: OptionalRule;
  value: boolean | string | number;
  onChange: (value: boolean | string | number) => void;
}) {
  // Stack vs. side-by-side layout. Booleans (a tiny toggle) and
  // numbers (a compact stepper) sit beside the label column. Choice
  // rules can have wide chip rows ("Disabled (single-class only)")
  // that crowd the description into a too-narrow column when laid
  // out horizontally; render them stacked instead so the chips get
  // the full row width and the description column doesn't wrap one
  // word per line.
  const stack = rule.type === 'choice';
  return (
    <View style={[styles.ruleRow, stack && styles.ruleRowStacked]}>
      <View style={{ flex: 1 }}>
        <Text variant="body-md" family="body" weight="semibold" style={{ color: colors.onSurface }}>
          {rule.label}
        </Text>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
          {rule.description}
        </Text>
      </View>
      <View style={[styles.ruleControl, stack && styles.ruleControlStacked]}>
        {rule.type === 'boolean' ? (
          <BooleanToggle value={!!value} onChange={onChange} />
        ) : null}
        {rule.type === 'choice' ? (
          <ChoicePicker rule={rule} value={String(value)} onChange={onChange} />
        ) : null}
        {rule.type === 'number' ? (
          <NumberStepper rule={rule} value={Number(value)} onChange={onChange} />
        ) : null}
      </View>
    </View>
  );
}

function BooleanToggle({
  value, onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggle,
        value && styles.toggleOn,
        pressed && { opacity: 0.85 },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
    </Pressable>
  );
}

function ChoicePicker({
  rule, value, onChange,
}: {
  rule: OptionalRule;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {(rule.choices ?? []).map((c) => {
        const active = c.key === value;
        return (
          <Pressable
            key={c.key}
            onPress={() => onChange(c.key)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text
              variant="body-sm"
              family="body"
              weight={active ? 'bold' : 'semibold'}
              style={{ color: active ? colors.onPrimary : colors.onSurface }}
            >
              {c.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NumberStepper({
  rule, value, onChange,
}: {
  rule: OptionalRule;
  value: number;
  onChange: (v: number) => void;
}) {
  const min = rule.min ?? Number.NEGATIVE_INFINITY;
  const max = rule.max ?? Number.POSITIVE_INFINITY;
  const step = rule.step ?? 1;
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <View style={styles.stepperRow}>
      <Pressable
        onPress={() => onChange(clamp(value - step))}
        disabled={value <= min}
        style={({ pressed }) => [
          styles.stepBtn,
          (pressed || value <= min) && { opacity: 0.6 },
        ]}
      >
        <Icon name="remove" size={16} color={colors.onSurface} />
      </Pressable>
      <Input
        value={String(value)}
        onChangeText={(t) => {
          const n = Number(t);
          if (!Number.isFinite(n)) return;
          onChange(clamp(Math.round(n)));
        }}
        keyboardType="numeric"
        style={styles.stepInput}
      />
      <Pressable
        onPress={() => onChange(clamp(value + step))}
        disabled={value >= max}
        style={({ pressed }) => [
          styles.stepBtn,
          (pressed || value >= max) && { opacity: 0.6 },
        ]}
      >
        <Icon name="add" size={16} color={colors.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panelWrapper: {
    width: '100%',
    maxWidth: 720,
    maxHeight: '90%',
  },
  panel: {
    // Inherit the wrapper's height bound so the inner ScrollView
    // gets a finite container to scroll within. Without this the
    // Card grows to its content's natural height and overflows the
    // wrapper, leaving no room (and no scroll affordance) for tall
    // rules editors.
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  scrollBody: {
    // Outer padding the Card used to provide; right padding is
    // bumped to spacing.xl + extra so the web scrollbar has a
    // dedicated lane that doesn't overlap the rule controls.
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg + 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  group: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '55',
  },
  groupTitle: {
    color: colors.outline,
    letterSpacing: 1.25,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
  },
  /** Stacked variant — label/description on top, control row below
   *  full-width. Used when the control would crowd the label column
   *  (multi-chip choice pickers). */
  ruleRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  ruleControl: {
    minWidth: 200,
    alignItems: 'flex-end',
  },
  /** Stacked control fills the row width and centers chips so
   *  they read as a single grouped option strip rather than
   *  hugging an edge. */
  ruleControlStacked: {
    minWidth: 0,
    alignItems: 'center',
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '88',
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.outlineVariant,
  },
  toggleKnobOn: {
    backgroundColor: colors.onPrimary,
    transform: [{ translateX: 20 }],
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    // Centered chip strip on a single line — reads as a single
    // grouped option selector. Long labels are kept short at the
    // rule-definition layer (the rule's description handles the
    // detail) so the strip never needs to wrap.
    justifyContent: 'center',
  },
  chip: {
    // Larger tap target + stronger surface contrast so the chips
    // read as buttons rather than text labels. Inactive chips sit
    // on `surfaceContainerHigh` (one tier above the modal panel),
    // active chips fill with the primary color so the selection is
    // unambiguous at a glance.
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '88',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '88',
  },
  stepInput: {
    width: 60,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
