// Read-only summary of the campaign's character-creation rules.
//
// Surfaces in the wizard when the player launched from a campaign
// (?campaignId=…). Players see what rules they're playing under
// before they pick a class or assign ability scores; nothing here
// is editable from the player side.
//
// Each line resolves a rule key to a short human label. Values fall
// back to the system's default when the campaign hasn't set the
// rule (the bag is already resolved at bootstrap time, so the
// summary just walks the bag).

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCharacterDraftStore } from '@vaultstone/store';
import { BUNDLED_SYSTEMS_BY_ID } from '@vaultstone/systems';
import {
  Card, Icon, MetaLabel, Text,
  colors, radius, spacing,
} from '@vaultstone/ui';
import type { OptionalRule } from '@vaultstone/types';

export function CampaignRulesSummary() {
  const campaignId = useCharacterDraftStore((s) => s.campaignId);
  const system = useCharacterDraftStore((s) => s.system);
  const rules = useCharacterDraftStore((s) => s.campaignRules);
  const [expanded, setExpanded] = useState(false);

  // Standalone characters don't have a campaign and don't see the
  // summary. Same for campaign-linked drafts where the bootstrap
  // hasn't yet finished hydrating rules (the bag is empty until
  // setCampaignRules fires).
  if (!campaignId || Object.keys(rules).length === 0) return null;

  const sys = BUNDLED_SYSTEMS_BY_ID[system];
  if (!sys) return null;

  // Show every rule with a non-default value first; fall back to
  // showing a few high-signal defaults so the player still gets a
  // sense of the table's posture even on a freshly-set campaign.
  // For the collapsed state we cap at 4 lines; expanded shows all.
  const rows = sys.optionalRules
    .filter((r) => rules[r.key] !== undefined)
    .map((r) => ({ rule: r, value: rules[r.key]! }));

  if (rows.length === 0) return null;

  const visible = expanded ? rows : rows.slice(0, 4);
  const hiddenCount = rows.length - visible.length;

  return (
    <Card tier="container" padding="md" style={styles.card}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.headerRow}
      >
        <View style={{ flex: 1 }}>
          <MetaLabel size="sm">Campaign rules</MetaLabel>
          <Text variant="body-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
            The DM has configured these rules for character creation in this campaign.
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
  value: boolean | string | number,
): string {
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
