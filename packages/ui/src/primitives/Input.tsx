import { useState } from 'react';
import { View, TextInput, type TextInputProps } from 'react-native';
import { MetaLabel } from './MetaLabel';
import { colors, fonts, radius, spacing } from '../tokens';

type Props = TextInputProps & {
  label?: string;
};

// Recessed minimalist field matching the Stitch "Lexicon Search" input —
// lowest-surface background, floating uppercase label, primary focus ring.
export function Input({ label, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        backgroundColor: colors.surfaceContainerLowest,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: focused ? colors.primary + '66' : 'transparent',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
      }}
    >
      {label ? <MetaLabel size="sm" style={{ marginBottom: 2 }}>{label}</MetaLabel> : null}
      <TextInput
        placeholderTextColor={colors.outline}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          {
            color: colors.onSurface,
            fontFamily: fonts.body,
            fontSize: 15,
            padding: 0,
            ...({ outlineStyle: 'none' } as object),
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}
