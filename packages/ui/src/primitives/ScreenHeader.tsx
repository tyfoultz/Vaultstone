import { View, type ViewProps } from 'react-native';
import { Text } from './Text';
import { colors, spacing } from '../tokens';

type Props = ViewProps & {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

// Top-of-content header used by reskinned screens. Pairs a display-weight
// title with an optional subtitle and a right-aligned actions slot.
export function ScreenHeader({ title, subtitle, actions, style, ...rest }: Props) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.xl,
          paddingBottom: spacing.lg,
          gap: spacing.md,
        },
        style,
      ]}
      {...rest}
    >
      <View style={{ flex: 1 }}>
        <Text variant="display-sm" family="headline" weight="bold" style={{ letterSpacing: -1 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="body-md"
            tone="secondary"
            style={{ marginTop: spacing.xs, color: colors.onSurfaceVariant }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View>{actions}</View> : null}
    </View>
  );
}
