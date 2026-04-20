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
  // Scale bounds derived by the route from canvas dimensions so the default
  // view fits the whole map regardless of image resolution.
  minScale: number;
  maxScale: number;
  initialViewport?: MapStackViewport;
  onViewportChange?: (v: MapStackViewport) => void;
  onCanvasClick?: (args: { xPct: number; yPct: number }) => void;
  // Web-only right-click placement — accepted here for API parity, not wired.
  onCanvasRightClick?: (args: { xPct: number; yPct: number }) => void;
  children?: ReactNode;
};

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
    minScale,
    maxScale,
    initialViewport,
    onViewportChange,
    onCanvasClick,
    children,
  },
  handleRef,
) {
  const sliderStep = (maxScale - minScale) / 8;
  const scale = useSharedValue(initialViewport?.scale ?? minScale);
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
      const next = Math.max(minScale, Math.min(maxScale, savedScale.value * e.scale));
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
      const next = Math.max(minScale, Math.min(maxScale, scale.value + delta));
      scale.value = withTiming(next, { duration: 150 });
      emit(next, translateX.value, translateY.value);
    },
    [emit, scale, translateX, translateY, minScale, maxScale],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      zoomIn: () => zoomBy(sliderStep),
      zoomOut: () => zoomBy(-sliderStep),
    }),
    [zoomBy, sliderStep],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const reset = () => {
    scale.value = withTiming(minScale, { duration: 200 });
    translateX.value = withTiming(0, { duration: 200 });
    translateY.value = withTiming(0, { duration: 200 });
    emit(minScale, 0, 0);
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
