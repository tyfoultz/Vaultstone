import { View, type ViewProps } from 'react-native';
import { Text } from './Text';
import { colors, radius } from '../tokens';

type Variant = 'category' | 'meta' | 'accent';

type Props = ViewProps & {
  label: string;
  variant?: Variant;
};

const BG: Record<Variant, string> = {
  category: colors.secondaryContainer,
  meta: colors.surfaceContainerHighest,
  accent: colors.primaryContainer,
};

const FG: Record<Variant, string> = {
  category: colors.onSecondaryContainer,
  meta: colors.onSurfaceVariant,
  accent: colors.onPrimaryContainer,
};

export function Chip({ label, variant = 'meta', style, ...rest }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: BG[variant],
          borderRadius: radius.full,
          paddingHorizontal: 12,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        },
        style,
      ]}
      {...rest}
    >
      <Text
        variant="label-sm"
        weight="bold"
        uppercase
        style={{ color: FG[variant], letterSpacing: 1.25 }}
      >
        {label}
      </Text>
    </View>
  );
}
