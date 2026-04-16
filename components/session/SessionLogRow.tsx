import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';
import {
  parseSessionEventPayload,
  SESSION_EVENT_CATEGORY,
  type SessionEventCategory,
  type SessionEventPayload,
} from '@vaultstone/types';

export type LogRowData = {
  id: string;
  eventType: string;
  createdAt: string;
  payload: unknown;
};

type Rendered = {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  text: string;
  category: SessionEventCategory;
};

function hpLabel(delta: number): string {
  if (delta < 0) return `took ${Math.abs(delta)} damage`;
  if (delta > 0) return `healed ${delta}`;
  return 'HP unchanged';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Formatter registry — one branch per event type. Keeping this exhaustive
// over the discriminated union makes adding a new event a compile error
// until it gets a renderer.
function renderPayload(p: SessionEventPayload): Rendered {
  const category = SESSION_EVENT_CATEGORY[p.type];
  switch (p.type) {
    case 'combat_started':
      return {
        icon: 'sword-cross', iconColor: colors.brand, category,
        text: `Combat started · ${p.combatants.length} combatants`,
      };
    case 'combat_ended':
      return {
        icon: 'stop-circle-outline', iconColor: colors.hpDanger, category,
        text: `Combat ended after round ${p.round}`,
      };
    case 'hp_changed':
      return {
        icon: p.delta < 0 ? 'heart-broken' : 'heart-plus',
        iconColor: p.delta < 0 ? colors.hpDanger : colors.hpHealthy,
        category,
        text: `${p.target_name} ${hpLabel(p.delta)}. HP ${p.old_hp} → ${p.new_hp}`,
      };
    case 'condition_added':
      return {
        icon: 'alert-circle-outline', iconColor: colors.hpWarning, category,
        text: `${p.target_name} gained ${p.condition}`,
      };
    case 'condition_removed':
      return {
        icon: 'check-circle-outline', iconColor: colors.hpHealthy, category,
        text: `${p.target_name} cleared ${p.condition}`,
      };
    case 'turn_advanced':
      return {
        icon: 'skip-next', iconColor: colors.brand, category,
        text: `Round ${p.round} · ${p.active_name}'s turn`,
      };
    case 'initiative_rolled':
      return {
        icon: 'dice-d20', iconColor: colors.brand, category,
        text: `${p.combatant_name} ${p.source === 'manual' ? 'set' : 'rolled'} initiative · ${p.total}`,
      };
    case 'narration':
      return {
        icon: 'book-open-page-variant-outline', iconColor: colors.textSecondary, category,
        text: p.text,
      };
  }
}

export function SessionLogRow({ row, compact }: { row: LogRowData; compact?: boolean }) {
  const parsed = parseSessionEventPayload(row.eventType, row.payload);
  const rendered: Rendered = parsed
    ? renderPayload(parsed)
    : {
        icon: 'help-circle-outline',
        iconColor: colors.textSecondary,
        text: `Unknown event: ${row.eventType}`,
        category: 'narrative',
      };
  return (
    <View style={[s.row, compact && s.rowCompact]}>
      <MaterialCommunityIcons
        name={rendered.icon}
        size={compact ? 14 : 16}
        color={rendered.iconColor}
        style={s.icon}
      />
      <View style={{ flex: 1 }}>
        <Text style={[s.text, compact && s.textCompact]} numberOfLines={compact ? 2 : undefined}>
          {rendered.text}
        </Text>
      </View>
      <Text style={[s.time, compact && s.timeCompact]}>{formatTime(row.createdAt)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  rowCompact: { paddingVertical: 4 },
  icon: { marginTop: 1 },
  text: { color: colors.textPrimary, fontSize: 13, lineHeight: 18 },
  textCompact: { fontSize: 12, lineHeight: 16 },
  time: { color: colors.textSecondary, fontSize: 11, fontVariant: ['tabular-nums'] },
  timeCompact: { fontSize: 10 },
});
