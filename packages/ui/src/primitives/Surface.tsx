import { View, type ViewProps } from 'react-native';
import { colors } from '../tokens';

type Tier = 'void' | 'lowest' | 'low' | 'container' | 'high' | 'highest';

type Props = ViewProps & {
  tier?: Tier;
};

const TIER_COLORS: Record<Tier, string> = {
  void: colors.surface,
  lowest: colors.surfaceContainerLowest,
  low: colors.surfaceContainerLow,
  container: colors.surfaceContainer,
  high: colors.surfaceContainerHigh,
  highest: colors.surfaceContainerHighest,
};

export function Surface({ tier = 'void', style, children, ...rest }: Props) {
  return (
    <View style={[{ backgroundColor: TIER_COLORS[tier] }, style]} {...rest}>
      {children}
    </View>
  );
}
