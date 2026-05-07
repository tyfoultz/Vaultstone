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
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
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
      {rules.map((rule) => (
        <RuleRow
          key={rule.key}
          rule={rule}
          value={draft[rule.key] ?? rule.default}
          onChange={(v) => onChange(rule.key, v)}
        />
      ))}
    </View>
  );
}

function RuleRow({
  rule, value, onChange,
}: {
  rule: OptionalRule;
  value: boolean | string | number;
  onChange: (value: boolean | string | number) => void;
}) {
  return (
    <View style={styles.ruleRow}>
      <View style={{ flex: 1 }}>
        <Text variant="body-md" family="body" weight="semibold" style={{ color: colors.onSurface }}>
          {rule.label}
        </Text>
        <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
          {rule.description}
        </Text>
      </View>
      <View style={styles.ruleControl}>
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
              variant="label-sm"
              family="body"
              weight={active ? 'bold' : 'medium'}
              style={{ color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant }}
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
    maxWidth: 640,
    maxHeight: '90%',
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
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
  ruleControl: {
    minWidth: 200,
    alignItems: 'flex-end',
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
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  chipActive: {
    backgroundColor: colors.primaryContainer + '55',
    borderColor: colors.primary + '88',
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
