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
 * Provenance tag shown on content entries beyond the SRD tier. Renders
 * `code` (e.g. "PHB") in compact form, the full `name` in detail. Returns
 * null when the entry has no source — SRD content stays unbadged.
 */
export function SourceBadge({ source, size = 'sm', style, ...rest }: Props) {
  if (!source) return null;
  const compact = size === 'sm';
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: colors.surfaceContainerHighest,
          borderRadius: radius.full,
          paddingHorizontal: compact ? 6 : 10,
          paddingVertical: compact ? 1 : 3,
          borderWidth: 1,
          borderColor: colors.outlineVariant + '55',
        },
        style,
      ]}
      {...rest}
    >
      <Text
        variant={compact ? 'label-sm' : 'body-sm'}
        weight="semibold"
        uppercase={compact}
        style={{
          color: colors.onSurfaceVariant,
          letterSpacing: compact ? 0.6 : 0,
          fontSize: compact ? 9 : 12,
        }}
      >
        {compact ? source.code : `${source.name}${source.page ? ` · p.${source.page}` : ''}`}
      </Text>
    </View>
  );
}
