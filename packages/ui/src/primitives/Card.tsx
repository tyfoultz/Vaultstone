import { View, type ViewProps } from 'react-native';
import { Surface } from './Surface';
import { colors, radius, spacing } from '../tokens';

type SurfaceTier = 'low' | 'container' | 'high' | 'highest';
type CardTier = SurfaceTier | 'hero';

type Props = ViewProps & {
  tier?: CardTier;
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
//
// `tier="hero"` is the Phase 2 Locations-grid treatment: spans 2 columns
// and 2 rows in a CSS grid parent, with extra padding + a soft primary
// highlight border. Web-only semantics (grid spanning) come from the
// parent's grid layout — this primitive just reports its intent.
export function Card({
  tier = 'high',
  padding = 'md',
  metadata,
  style,
  children,
  ...rest
}: Props) {
  const isHero = tier === 'hero';
  const surfaceTier: SurfaceTier = isHero ? 'high' : tier;
  // Grid-spanning props are web-only; RN's ViewStyle types accept them as
  // unknown keys so no `@ts-expect-error` is needed. Wrapped as a plain
  // object cast to sidestep TS's style-inference widening.
  const heroStyle = isHero
    ? ({
        gridColumn: 'span 2 / span 2',
        gridRow: 'span 2 / span 2',
        borderWidth: 1,
        borderColor: 'rgba(211, 187, 255, 0.18)',
        padding: PADDING.lg,
      } as object)
    : null;

  return (
    <Surface
      tier={surfaceTier}
      style={[
        {
          borderRadius: radius.xl,
          padding: PADDING[padding],
          overflow: 'hidden',
        },
        heroStyle,
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
