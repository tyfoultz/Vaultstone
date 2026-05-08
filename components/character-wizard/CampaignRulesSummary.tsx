// Read-only summary of the character-creation rules in effect for
// the wizard's current run. Two modes:
//
//   • Campaign-launched (?campaignId=…) — the DM picked these
//     rules; players see the resolved values so they know what
//     they're playing under. Nothing editable from the player side.
//   • Standalone — the system's bundled defaults apply; players
//     see them as informational context for the character.
//
// Each line resolves a rule key to a short human label. The
// underlying bag is resolved at bootstrap time so the summary just
// walks the rule definitions and reads bag values; missing keys
// fall through to the rule's `default`.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { BUNDLED_SYSTEMS_BY_ID } from '@vaultstone/systems';
import {
  Card, Icon, MetaLabel, Text,
  colors, spacing,
} from '@vaultstone/ui';
import type { OptionalRule } from '@vaultstone/types';

export function CampaignRulesSummary() {
  const campaignId = useCharacterDraftStore((s) => s.campaignId);
  const system = useCharacterDraftStore((s) => s.system);
  const rules = useCharacterDraftStore((s) => s.campaignRules);
  const [expanded, setExpanded] = useState(false);

  const sys = BUNDLED_SYSTEMS_BY_ID[system];
  if (!sys) return null;

  // Walk the system's rule definitions; for each, prefer the
  // resolved bag value, otherwise fall through to the rule's
  // bundled default. Standalone wizards land entirely in the
  // fallback path; campaign-launched ones get the DM's saved
  // values everywhere they touched a rule.
  const rows = sys.optionalRules.map((rule) => {
    const value = rules[rule.key] ?? rule.default;
    return { rule, value };
  });

  if (rows.length === 0) return null;

  const isCampaign = !!campaignId;
  const eyebrow = isCampaign ? 'Campaign rules' : 'Character creation rules';
  const description = isCampaign
    ? 'The DM has configured these rules for character creation in this campaign.'
    : 'These are the system defaults for character creation. The DM of a campaign you join can override them.';

  const visible = expanded ? rows : rows.slice(0, 4);
  const hiddenCount = rows.length - visible.length;

  return (
    <Card tier="container" padding="md" style={styles.card}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.headerRow}
      >
        <View style={{ flex: 1 }}>
          <MetaLabel size="sm">{eyebrow}</MetaLabel>
          <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
            {description}
          </Text>
        </View>
        <Icon
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.onSurfaceVariant}
        />
      </Pressable>
      <View style={styles.list}>
        {visible.map(({ rule, value }) => (
          <View key={rule.key} style={styles.row}>
            <Text variant="body-sm" family="body" weight="semibold" style={styles.label}>
              {rule.label}
            </Text>
            <Text variant="body-sm" family="body" style={styles.value}>
              {formatValue(rule, value)}
            </Text>
          </View>
        ))}
        {!expanded && hiddenCount > 0 ? (
          <Text variant="label-sm" family="body" style={styles.moreHint}>
            + {hiddenCount} more — tap to expand.
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Convert a stored rule value into the user-facing label. Choices
 * resolve via the rule's choices[] table; booleans render as On/Off;
 * numbers pass through. Falls back to String() for unknown shapes.
 */
function formatValue(
  rule: OptionalRule,
  value: boolean | string | number | undefined,
): string {
  if (value === undefined) return '—';
  if (rule.type === 'boolean') return value ? 'On' : 'Off';
  if (rule.type === 'choice') {
    const match = rule.choices?.find((c) => c.key === value);
    return match?.label ?? String(value);
  }
  if (rule.type === 'number') return String(value);
  return String(value);
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  list: {
    gap: 6,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  label: {
    color: colors.onSurfaceVariant,
    width: 200,
  },
  value: {
    flex: 1,
    color: colors.onSurface,
  },
  moreHint: {
    color: colors.outline,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'right',
  },
});
