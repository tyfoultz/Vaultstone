import { Pressable, View, type GestureResponderEvent, type ViewStyle } from 'react-native';

import { Icon } from '../Icon';
import { colors } from '../tokens';

export type VisibilityState = 'player' | 'gm' | 'unknown';

type Props = {
  visibility: VisibilityState;
  interactive?: boolean;
  onPress?: () => void;
  size?: number;
  style?: ViewStyle;
};

// Per-card / per-page visibility chip matching the handoff's 26px
// backdrop-blur eye. Phase 2 renders it read-only; Phase 4 wires the
// interactive toggle + lens filtering.
export function VisibilityBadge({
  visibility,
  interactive = false,
  onPress,
  size = 26,
  style,
}: Props) {
  const iconName = visibility === 'gm' ? 'visibility-off' : 'visibility';
  const tint =
    visibility === 'gm'
      ? colors.gm
      : visibility === 'player'
        ? colors.player
        : colors.onSurfaceVariant;
  const bg =
    visibility === 'gm'
      ? colors.gmGlow
      : visibility === 'player'
        ? colors.playerGlow
        : 'rgba(255, 255, 255, 0.06)';

  const content = (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: tint + '55',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Icon name={iconName} size={Math.floor(size * 0.55)} color={tint} />
    </View>
  );

  if (interactive && onPress) {
    return (
      <Pressable
        onPress={(e: GestureResponderEvent) => {
          // Cards wrap the badge in their own Pressable; without stopping
          // propagation the eye-click would also navigate into the page.
          // stopPropagation is a no-op on native (single-pressable capture
          // already handles it) and the real fix on web.
          e.stopPropagation?.();
          onPress();
        }}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}
