import { useState } from 'react';
import { Pressable, ActivityIndicator, type PressableProps } from 'react-native';
import { Text } from './Text';
import { Icon } from '../Icon';
import { colors, radius, spacing } from '../tokens';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  icon?: React.ComponentProps<typeof Icon>['name'];
  loading?: boolean;
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  tone?: 'secondary' | 'neutral';
};

// Secondary "ghost" action — thin outline-variant border, translucent bg on
// press. Matches the "SCAN HORIZON" button in the Stitch tokens page.
export function GhostButton({
  label,
  icon,
  loading,
  disabled,
  size = 'md',
  fullWidth,
  tone = 'secondary',
  style,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const [pressed, setPressed] = useState(false);
  const height = size === 'lg' ? 52 : 44;
  const textColor = tone === 'secondary' ? colors.secondary : colors.onSurface;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPressIn={(e) => { setPressed(true); onPressIn?.(e); }}
      onPressOut={(e) => { setPressed(false); onPressOut?.(e); }}
      style={[
        {
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          height,
          borderRadius: radius.xl,
          borderColor: colors.outlineVariant + '4D', // ~30% opacity
          borderWidth: 1,
          paddingHorizontal: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          backgroundColor: pressed ? colors.secondaryContainer + '1A' : 'transparent',
          opacity: disabled || loading ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style as any,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={textColor} /> : null}
          <Text
            variant={size === 'lg' ? 'title-sm' : 'body-md'}
            weight="semibold"
            family="headline"
            style={{ color: textColor, letterSpacing: 0.5 }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
