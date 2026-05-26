import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, radius } from '@vaultstone/ui';

/**
 * One line in the breakdown — a labelled contribution to the total.
 * Lines render as `label ... value` with the value monospace-aligned.
 * Sources contributing 0 are still shown so the player can see *why*
 * (e.g. "Proficiency +0" when not proficient) — clarity > brevity.
 */
export type StatBreakdownLine = {
  label: string;
  value: string;
};

/**
 * Centered modal that explains how a calculated value (save, skill,
 * ability check, AC, etc.) was derived, with an optional Roll button
 * for rollable surfaces. Replaces the old tap-to-roll behavior across
 * the character sheet — every numeric value now opens this first.
 */
export function StatBreakdownModal({
  visible,
  title,
  subtitle,
  total,
  lines,
  description,
  rollLabel,
  onRoll,
  onClose,
}: {
  visible: boolean;
  /** Stat name (e.g. "Stealth", "DEX Save", "Initiative"). */
  title: string;
  /** Optional one-liner under the title (e.g. "DEX-based skill", "d20 + DEX"). */
  subtitle?: string;
  /** Final value to display large. Formatted by caller (e.g. "+5", "15"). */
  total: string;
  /** Per-source breakdown rows. Order matters — typically ability mod,
   *  proficiency, then magic / situational bonuses last. */
  lines: StatBreakdownLine[];
  /** Optional descriptive body rendered below the breakdown — used for
   *  rules text (skill descriptions, AC formula, etc.) so the player
   *  doesn't have to chase a separate detail modal. */
  description?: string;
  /** When provided, renders a primary Roll button that invokes this
   *  and closes the modal. Omit for info-only surfaces (AC, passive
   *  perception, spell save DC). */
  onRoll?: () => void;
  /** Button text — defaults to "Roll" when onRoll is set. */
  rollLabel?: string;
  onClose: () => void;
}) {
  function handleRoll() {
    onRoll?.();
    onClose();
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.card} onPress={() => {}}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} activeOpacity={0.7}>
              <MaterialCommunityIcons name="close" size={18} color={colors.outline} />
            </TouchableOpacity>
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalValue}>{total}</Text>
          </View>
          <View style={s.linesWrap}>
            {lines.map((ln, i) => (
              <View key={`${ln.label}-${i}`} style={s.line}>
                <Text style={s.lineLabel}>{ln.label}</Text>
                <View style={s.lineDots} />
                <Text style={s.lineValue}>{ln.value}</Text>
              </View>
            ))}
          </View>
          {description ? <Text style={s.description}>{description}</Text> : null}
          <View style={s.actions}>
            <TouchableOpacity onPress={onClose} style={[s.btn, s.btnSecondary]} activeOpacity={0.7}>
              <Text style={s.btnSecondaryText}>{onRoll ? 'Cancel' : 'Close'}</Text>
            </TouchableOpacity>
            {onRoll ? (
              <TouchableOpacity onPress={handleRoll} style={[s.btn, s.btnPrimary]} activeOpacity={0.7}>
                <MaterialCommunityIcons name="dice-d20" size={14} color={colors.onPrimary} />
                <Text style={s.btnPrimaryText}>{rollLabel ?? 'Roll'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: {
    width: '100%', maxWidth: 360,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 14, gap: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline, marginTop: 2,
  },
  totalRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 12,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  totalLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
  },
  totalValue: {
    fontSize: 26, fontFamily: fonts.headline, fontWeight: '800',
    color: colors.primary,
  },
  linesWrap: { gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineLabel: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant },
  lineDots: {
    flex: 1, height: 1, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant, borderStyle: 'dashed' as const,
    marginHorizontal: 4,
  },
  lineValue: {
    fontSize: 12, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, minWidth: 36, textAlign: 'right',
  },
  description: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant,
    lineHeight: 17, marginTop: 4,
  },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 4 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: radius.lg, borderWidth: 1,
  },
  btnSecondary: { borderColor: colors.outlineVariant, backgroundColor: 'transparent' },
  btnSecondaryText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },
  btnPrimary: { backgroundColor: colors.primaryContainer, borderColor: colors.primaryContainer },
  btnPrimaryText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700', color: colors.onPrimary, letterSpacing: 0.3 },
});
