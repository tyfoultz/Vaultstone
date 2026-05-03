import { View, type ViewProps } from 'react-native';
import { Text } from './Text';
import { colors, radius } from '../tokens';
import type { ImportSource } from '@vaultstone/types';

type Props = ViewProps & {
  source: ImportSource | undefined;
  /** Compact variant for list rows; full variant for detail surfaces. */
  size?: 'sm' | 'md';
};

/**
 * Provenance tag shown on every content entry. Renders `code` in compact
 * form (truncated at 14 chars so long pack names don't blow out row layout)
 * and the full `name` in detail form. Returns null when the entry has no
 * source — currently never the case post-Stage-1, but kept for future
 * unsourced content types.
 */
export function SourceBadge({ source, size = 'sm', style, ...rest }: Props) {
  if (!source) return null;
  const compact = size === 'sm';
  const label = compact
    ? truncate(source.code, 14)
    : `${source.name}${source.page ? ` · p.${source.page}` : ''}`;
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: colors.surfaceContainerHighest,
          borderRadius: radius.full,
          paddingHorizontal: compact ? 8 : 10,
          paddingVertical: compact ? 2 : 3,
          borderWidth: 1,
          borderColor: colors.outlineVariant + '55',
        },
        style,
      ]}
      accessibilityLabel={source.name}
      {...rest}
    >
      <Text
        variant={compact ? 'label-sm' : 'body-sm'}
        weight="semibold"
        style={{
          color: colors.onSurfaceVariant,
          fontSize: compact ? 10 : 12,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
