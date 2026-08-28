import { useState } from 'react';
import { StyleSheet, View, TextInput, type TextInputProps } from 'react-native';
import { MetaLabel } from './MetaLabel';
import { colors, fonts, radius, spacing } from '../tokens';

type Props = TextInputProps & {
  label?: string;
  /**
   * Multiline fields grow with their content by default so long prose
   * (item descriptions, spell text, stat-block traits) stays visible
   * instead of scrolling inside a short fixed box. Pass `false` for a
   * fixed-height box. Auto-grow is also skipped when the caller sets an
   * explicit `height` in `style` — that caller is driving the size
   * itself (see the AI composer, which clamps to a max).
   */
  autoGrow?: boolean;
};

// Recessed minimalist field matching the Stitch "Lexicon Search" input —
// lowest-surface background, floating uppercase label, primary focus ring.
export function Input({
  label,
  style,
  onFocus,
  onBlur,
  onChange,
  onContentSizeChange,
  multiline,
  autoGrow,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  const flat = StyleSheet.flatten(style) ?? {};
  const grows = !!multiline && autoGrow !== false && flat.height == null;
  const minHeight = typeof flat.minHeight === 'number' ? flat.minHeight : 0;

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
        multiline={multiline}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        // Native reports true content size here, and on web this is the
        // first measurement (on mount, before any height is applied) —
        // which is what sizes an edit form to its existing text.
        onContentSizeChange={(e) => {
          if (grows) {
            setContentHeight(Math.max(minHeight, e.nativeEvent.contentSize.height));
          }
          onContentSizeChange?.(e);
        }}
        onChange={(e) => {
          // Web-only correction. react-native-web measures a multiline
          // field with `scrollHeight`, which never reports less than the
          // height already on the element — so the box would grow and
          // never shrink back when text is deleted. Collapse to `auto`,
          // read the real content height, then restore what was there and
          // let React own the height again.
          if (grows) {
            const node = (e as unknown as { target?: HTMLTextAreaElement }).target;
            if (node && typeof node.scrollHeight === 'number') {
              const prev = node.style.height;
              node.style.height = 'auto';
              const measured = node.scrollHeight;
              node.style.height = prev;
              setContentHeight(Math.max(minHeight, measured));
            }
          }
          onChange?.(e);
        }}
        style={[
          {
            color: colors.onSurface,
            fontFamily: fonts.body,
            fontSize: 15,
            padding: 0,
            ...({ outlineStyle: 'none' } as object),
          },
          style,
          grows && contentHeight != null ? { height: contentHeight } : null,
        ]}
        {...rest}
      />
    </View>
  );
}
