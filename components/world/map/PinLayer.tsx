import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, colors, radius } from '@vaultstone/ui';
import type { MapPin, PinType } from '@vaultstone/api';

import { toMaterialIcon } from '../helpers';

type Props = {
  pins: MapPin[];
  pinTypes: PinType[];
  imageWidth: number;
  imageHeight: number;
  visibleTypes?: Set<string> | null;
  onPinPress?: (pin: MapPin) => void;
};

// Absolute-positioned pin markers inside the map canvas's transformed
// content box. Pins scale with the image under pan/zoom — we can add
// counter-scale (Phase 8 polish) once users ask for it.
export function PinLayer({
  pins,
  pinTypes,
  imageWidth,
  imageHeight,
  visibleTypes,
  onPinPress,
}: Props) {
  const typesByKey: Record<string, PinType> = Object.fromEntries(
    pinTypes.map((t) => [t.key, t]),
  );

  const shown = visibleTypes
    ? pins.filter((p) => visibleTypes.has(p.pin_type))
    : pins;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, top: 0, width: imageWidth, height: imageHeight }}
    >
      {shown.map((pin) => {
        const type = typesByKey[pin.pin_type];
        const color = pin.color_override ?? type?.default_color_hex ?? colors.primary;
        const iconKey = pin.icon_key_override ?? type?.default_icon_key ?? 'map-pin';
        const left = pin.x_pct * imageWidth;
        const top = pin.y_pct * imageHeight;

        return (
          <Pressable
            key={pin.id}
            onPress={onPinPress ? () => onPinPress(pin) : undefined}
            style={[
              styles.marker,
              {
                left: left - PIN_SIZE / 2,
                top: top - PIN_SIZE,
                borderColor: color,
                backgroundColor: colors.surfaceContainerHigh,
              },
            ]}
          >
            <Icon
              name={toMaterialIcon(iconKey) as React.ComponentProps<typeof Icon>['name']}
              size={18}
              color={color}
            />
            {pin.label ? (
              <View style={styles.labelBubble} pointerEvents="none">
                <Text variant="label-sm" tone="primary" style={styles.labelText} numberOfLines={1}>
                  {pin.label}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const PIN_SIZE = 32;

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  labelBubble: {
    position: 'absolute',
    top: PIN_SIZE + 2,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.DEFAULT,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: 160,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  labelText: {
    color: colors.onSurface,
    fontSize: 11,
  },
});
