import { forwardRef, useCallback, useImperativeHandle, type ReactNode } from 'react';
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
  // Web-only right-click placement — accepted here for API parity, not wired.
  onCanvasRightClick?: (args: { xPct: number; yPct: number }) => void;
  children?: ReactNode;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = (MAX_SCALE - MIN_SCALE) / 8;

export type MapCanvasHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
};

// Pan/zoom map canvas (native). Mirrors MapCanvas.web's API so the route
// layer stays platform-agnostic. Gestures are composed simultaneously
// (pinch + pan); a single-tap reports a normalised coordinate for
// placement mode. Double-tap zoom is intentionally absent — the canvas
// exposes imperative zoomIn/zoomOut via ref for the ZoomControl bar.
export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  {
    imageUrl,
    imageWidth,
    imageHeight,
    initialViewport,
    onViewportChange,
    onCanvasClick,
    children,
  },
  handleRef,
) {
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

  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e, success) => {
      if (!success) return;
      const xPct = e.x / imageWidth;
      const yPct = e.y / imageHeight;
      if (xPct >= 0 && xPct <= 1 && yPct >= 0 && yPct <= 1) {
        runOnJS(emitTap)(xPct, yPct);
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, singleTap);

  const zoomBy = useCallback(
    (delta: number) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta));
      scale.value = withTiming(next, { duration: 150 });
      emit(next, translateX.value, translateY.value);
    },
    [emit, scale, translateX, translateY],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      zoomIn: () => zoomBy(ZOOM_STEP),
      zoomOut: () => zoomBy(-ZOOM_STEP),
    }),
    [zoomBy],
  );

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
});

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
