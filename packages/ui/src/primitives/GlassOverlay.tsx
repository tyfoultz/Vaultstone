import { Platform, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors } from '../tokens';

type Props = ViewProps & {
  intensity?: number;
  tint?: 'dark' | 'systemMaterialDark';
  opacity?: number;
};

// Glass container — backdrop blur + tinted surface. Used for the sidebar
// shell and modal backdrops per the Stitch "glassmorphism" directive. Falls
// back to a solid elevated surface on platforms where BlurView is absent.
export function GlassOverlay({
  intensity = 60,
  tint = 'dark',
  opacity = 0.8,
  style,
  children,
  ...rest
}: Props) {
  if (Platform.OS === 'web') {
    // Native BlurView renders inconsistently on RNW; use CSS backdrop-filter.
    const webStyle = {
      backgroundColor: `rgba(18, 20, 22, ${opacity})`,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    } as unknown as ViewProps['style'];
    return (
      <View style={[webStyle, style]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <BlurView intensity={intensity} tint={tint} style={style as any} {...rest}>
      <View
        style={{
          ...StyleSheetAbsoluteFill,
          backgroundColor: `rgba(18, 20, 22, ${opacity * 0.75})`,
        }}
      />
      {children}
    </BlurView>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

export { colors as glassColors };
