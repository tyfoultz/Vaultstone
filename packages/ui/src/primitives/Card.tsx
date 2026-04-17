import { View, type ViewProps } from 'react-native';
import { Surface } from './Surface';
import { colors, radius, spacing } from '../tokens';

type Props = ViewProps & {
  tier?: 'low' | 'container' | 'high' | 'highest';
  padding?: keyof typeof PADDING;
  metadata?: React.ReactNode;
};

const PADDING = {
  sm: spacing.md,
  md: spacing.lg,
  lg: spacing.xl,
} as const;

// Editorial card. Default tier is `high` — matches the Stitch pattern where
// cards sit on the `surface` canvas and pop via tonal elevation rather than
// borders. `metadata` renders in the top-right corner for labels like
// "EPIC ARTIFACT" seen across the mocks.
export function Card({
  tier = 'high',
  padding = 'md',
  metadata,
  style,
  children,
  ...rest
}: Props) {
  return (
    <Surface
      tier={tier}
      style={[
        {
          borderRadius: radius.xl,
          padding: PADDING[padding],
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}
    >
      {metadata ? (
        <View style={{ position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 1 }}>
          {metadata}
        </View>
      ) : null}
      {children}
    </Surface>
  );
}

// Re-export so consumers can use Card's color in custom internal layouts.
export { colors as cardColors };
