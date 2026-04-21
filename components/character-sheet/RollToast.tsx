import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, fonts, radius } from '@vaultstone/ui';

export interface RollResult {
  label: string;
  rolls: number[];
  bonus: number;
  total: number;
  crit?: boolean;
  fumble?: boolean;
}

interface Props {
  result: RollResult | null;
}

export function RollToast({ result }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (!result) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 8, duration: 200, useNativeDriver: true }),
      ]).start();
      return;
    }
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [result]);

  if (!result) return null;

  const { label, rolls, bonus, total, crit, fumble } = result;
  const accentColor = crit ? colors.hpHealthy : fumble ? colors.hpDanger : colors.primary;
  const rollStr = `[${rolls.join(', ')}]${bonus !== 0 ? (bonus > 0 ? ` + ${bonus}` : ` − ${Math.abs(bonus)}`) : ''}`;

  return (
    <Animated.View style={[s.toast, { opacity, transform: [{ translateY }] }]}>
      <View style={[s.toastInner, { borderColor: accentColor }]}>
        <Text style={s.toastLabel}>{label.toUpperCase()}</Text>
        <Text style={[s.toastTotal, { color: accentColor }]}>{total}</Text>
        <Text style={s.toastDice}>{rollStr}{crit ? ' · CRITICAL' : fumble ? ' · FUMBLE' : ''}</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 88,
    alignSelf: 'center',
    zIndex: 50,
    pointerEvents: 'none',
  } as any,
  toastInner: {
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    minWidth: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  toastLabel: {
    fontSize: 9,
    fontFamily: fonts.label,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.outline,
    marginBottom: 4,
  },
  toastTotal: {
    fontSize: 36,
    fontFamily: fonts.headline,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: -1,
  },
  toastDice: {
    fontSize: 10,
    fontFamily: fonts.body,
    color: colors.outline,
    marginTop: 2,
  },
});
