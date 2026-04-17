import type { TextProps } from 'react-native';
import { Text } from './Text';
import { colors } from '../tokens';

type Props = TextProps & {
  tone?: 'muted' | 'secondary' | 'accent';
  size?: 'sm' | 'md';
};

// Wide-tracked uppercase small-cap label used across the Noir system for
// metadata (e.g. "ONGOING CAMPAIGN", "TIER 3"). Matches the `font-label
// text-[10px] uppercase tracking-widest` pattern from the Stitch mocks.
export function MetaLabel({ tone = 'muted', size = 'sm', style, children, ...rest }: Props) {
  const toneColor =
    tone === 'accent' ? colors.primary
    : tone === 'secondary' ? colors.onSurfaceVariant
    : colors.outline;

  return (
    <Text
      variant={size === 'md' ? 'label-md' : 'label-sm'}
      family="body"
      weight="semibold"
      uppercase
      style={[{ color: toneColor, letterSpacing: 1.5 }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}
