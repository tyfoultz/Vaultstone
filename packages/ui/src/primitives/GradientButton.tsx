import { useState } from 'react';
import { Pressable, View, ActivityIndicator, type PressableProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './Text';
import { Icon } from '../Icon';
import { colors, radius, spacing } from '../tokens';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  icon?: React.ComponentProps<typeof Icon>['name'];
  loading?: boolean;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
};

// Primary CTA. Wraps a linear gradient from `primary` → `primary-container`,
// per the Stitch "ACTIVATE ARCANE" button. Adds a scale-98 press micro-
// interaction to match the tactile feel called for in the design system.
export function GradientButton({
  label,
  icon,
  loading,
  disabled,
  size = 'md',
  fullWidth,
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const [pressed, setPressed] = useState(false);
  const height = size === 'lg' ? 52 : 44;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPressIn={(e) => { setPressed(true); onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); onPressOut?.(e); }}
      style={[
        {
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          transform: [{ scale: pressed ? 0.98 : 1 }],
          opacity: disabled || loading ? 0.5 : 1,
        },
        style as any,
      ]}
      {...rest}
    >
      <LinearGradient
        colors={[colors.primary, colors.primaryContainer]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          height,
          borderRadius: radius.xl,
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={18} color={colors.onPrimary} /> : null}
            <Text
              variant={size === 'lg' ? 'title-sm' : 'body-md'}
              weight="bold"
              family="headline"
              uppercase
              style={{ color: colors.onPrimary, letterSpacing: 1 }}
            >
              {label}
            </Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}
