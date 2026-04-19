import { useCallback, type ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { GhostButton, colors, spacing } from '@vaultstone/ui';
import type { MapStackViewport } from '@vaultstone/store';

type Props = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  initialViewport?: MapStackViewport;
  onViewportChange?: (v: MapStackViewport) => void;
  onCanvasClick?: (args: { xPct: number; yPct: number }) => void;
  children?: ReactNode;
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

// Pan/zoom map canvas (native). Mirrors MapCanvas.web's API so the route
// layer stays platform-agnostic. Gestures are composed simultaneously
// (pinch + pan) with an exclusive tap branch (double-tap zooms to 2x,
// single-tap reports a normalised coordinate for placement mode).
export function MapCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  initialViewport,
  onViewportChange,
  onCanvasClick,
  children,
}: Props) {
  const scale = useSharedValue(initialViewport?.scale ?? 1);
  const translateX = useSharedValue(initialViewport?.translateX ?? 0);
  const translateY = useSharedValue(initialViewport?.translateY ?? 0);
  const savedScale = useSharedValue(scale.value);
  const savedTx = useSharedValue(translateX.value);
  const savedTy = useSharedValue(translateY.value);

  const emit = useCallback(
    (s: number, tx: number, ty: number) => {
      onViewportChange?.({ scale: s, translateX: tx, translateY: ty });
    },
    [onViewportChange],
  );

  const emitTap = useCallback(
    (xPct: number, yPct: number) => {
      onCanvasClick?.({ xPct, yPct });
    },
    [onCanvasClick],
  );

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * e.scale));
      scale.value = next;
    })
    .onEnd(() => {
      runOnJS(emit)(scale.value, translateX.value, translateY.value);
    });

  const pan = Gesture.Pan()
    .onStart(() => {
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = savedTx.value + e.translationX;
      translateY.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      runOnJS(emit)(scale.value, translateX.value, translateY.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const next = scale.value >= 2 ? 1 : 2;
      scale.value = withTiming(next, { duration: 200 });
      translateX.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(0, { duration: 200 });
      runOnJS(emit)(next, 0, 0);
    });

  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .requireExternalGestureToFail(doubleTap)
    .onEnd((e, success) => {
      if (!success) return;
      const xPct = e.x / imageWidth;
      const yPct = e.y / imageHeight;
      if (xPct >= 0 && xPct <= 1 && yPct >= 0 && yPct <= 1) {
        runOnJS(emitTap)(xPct, yPct);
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const reset = () => {
    scale.value = withTiming(1, { duration: 200 });
    translateX.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    emit(1, 0, 0);
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[{ width: imageWidth, height: imageHeight }, animatedStyle]}>
          <Image
            source={{ uri: imageUrl }}
            style={{ width: imageWidth, height: imageHeight }}
            resizeMode="contain"
          />
          {children}
        </Animated.View>
      </GestureDetector>
      <View style={styles.resetButton} pointerEvents="box-none">
        <GhostButton label="Reset view" onPress={reset} />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    position: 'relative',
    overflow: 'hidden',
  },
  resetButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 2,
  },
});
