import { View, type ViewProps } from 'react-native';
import { Text } from './Text';
import { MetaLabel } from './MetaLabel';
import { colors, spacing } from '../tokens';

type Props = ViewProps & {
  title: string;
  meta?: string;
  accent?: boolean;
};

// Section header pattern used across the Stitch dashboards — primary-tinted
// headline on the left, muted right-aligned metadata tag.
export function SectionHeader({ title, meta, accent = true, style, ...rest }: Props) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: spacing.md,
        },
        style,
      ]}
      {...rest}
    >
      <Text
        variant="headline-sm"
        family="headline"
        weight="semibold"
        style={{ color: accent ? colors.primary : colors.onSurface, letterSpacing: -0.5 }}
      >
        {title}
      </Text>
      {meta ? <MetaLabel>{meta}</MetaLabel> : null}
    </View>
  );
}
