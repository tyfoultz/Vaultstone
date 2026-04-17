import { Text as RNText, type TextProps } from 'react-native';
import { colors, fonts, typography } from '../tokens';

type Variant =
  | 'display-lg'
  | 'display-md'
  | 'display-sm'
  | 'headline-lg'
  | 'headline-md'
  | 'headline-sm'
  | 'title-lg'
  | 'title-md'
  | 'title-sm'
  | 'body-lg'
  | 'body-md'
  | 'body-sm'
  | 'label-lg'
  | 'label-md'
  | 'label-sm';

type Tone = 'primary' | 'secondary' | 'accent' | 'muted' | 'danger' | 'inherit';

type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

type Props = TextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: Weight;
  family?: 'body' | 'headline';
  uppercase?: boolean;
};

const VARIANT_SIZE: Record<Variant, number> = {
  'display-lg': typography.displayLg,
  'display-md': typography.displayMd,
  'display-sm': typography.displaySm,
  'headline-lg': typography.headlineLg,
  'headline-md': typography.headlineMd,
  'headline-sm': typography.headlineSm,
  'title-lg': typography.titleLg,
  'title-md': typography.titleMd,
  'title-sm': typography.titleSm,
  'body-lg': typography.bodyLg,
  'body-md': typography.bodyMd,
  'body-sm': typography.bodySm,
  'label-lg': typography.labelLg,
  'label-md': typography.labelMd,
  'label-sm': typography.labelSm,
};

const TONE_COLOR: Record<Tone, string | undefined> = {
  primary: colors.onSurface,
  secondary: colors.onSurfaceVariant,
  accent: colors.primary,
  muted: colors.outline,
  danger: colors.hpDanger,
  inherit: undefined,
};

// Family defaults: `display`/`headline` variants use Space Grotesk; everything
// else uses Manrope. Explicit `family` prop overrides.
function defaultFamilyFor(variant: Variant): 'body' | 'headline' {
  if (variant.startsWith('display') || variant.startsWith('headline')) return 'headline';
  return 'body';
}

export function Text({
  variant = 'body-md',
  tone = 'primary',
  weight,
  family,
  uppercase,
  style,
  children,
  ...rest
}: Props) {
  const resolvedFamily = family ?? defaultFamilyFor(variant);
  const fontFamily = resolvedFamily === 'headline' ? fonts.headline : fonts.body;
  const fontWeight =
    weight === 'regular' ? '400'
    : weight === 'medium' ? '500'
    : weight === 'semibold' ? '600'
    : weight === 'bold' ? '700'
    : undefined;

  return (
    <RNText
      style={[
        {
          color: TONE_COLOR[tone],
          fontFamily,
          fontSize: VARIANT_SIZE[variant],
          ...(fontWeight ? { fontWeight } : null),
          ...(uppercase ? { textTransform: 'uppercase' as const } : null),
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}
