import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  type NativeSyntheticEvent, type TextInputSelectionChangeEventData,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';
import { RichTextRenderer } from './RichTextRenderer';

export interface RichTextEditorProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /**
   * Fixed minimum height. When omitted the editor fills its parent via flex:1,
   * which is what dock/pop-out panels want. Pass a number (e.g. 180) to opt
   * into a scrollable minimum instead — useful in non-flex parents like the
   * Session Mode notes rail.
   */
  minHeight?: number;
  readOnly?: boolean;
  testID?: string;
}

type Selection = { start: number; end: number };

function wrap(value: string, sel: Selection, marker: string): { value: string; selection: Selection } {
  const before = value.slice(0, sel.start);
  const inner = value.slice(sel.start, sel.end);
  const after = value.slice(sel.end);
  if (inner.length === 0) {
    const next = `${before}${marker}${marker}${after}`;
    const caret = sel.start + marker.length;
    return { value: next, selection: { start: caret, end: caret } };
  }
  const next = `${before}${marker}${inner}${marker}${after}`;
  const newEnd = sel.end + marker.length * 2;
  return { value: next, selection: { start: sel.start + marker.length, end: newEnd - marker.length } };
}

// Prefix every line in the selection (or the current line when selection is
// empty) with `prefix`. Idempotent-ish: double-applying just stacks prefixes,
// which matches how most Markdown editors behave.
function prefixLines(
  value: string,
  sel: Selection,
  prefix: string,
): { value: string; selection: Selection } {
  const lineStart = value.lastIndexOf('\n', sel.start - 1) + 1;
  const lineEndSearch = value.indexOf('\n', sel.end);
  const lineEnd = lineEndSearch === -1 ? value.length : lineEndSearch;

  const before = value.slice(0, lineStart);
  const block = value.slice(lineStart, lineEnd);
  const after = value.slice(lineEnd);

  const prefixed = block
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');

  const delta = prefixed.length - block.length;
  const next = `${before}${prefixed}${after}`;
  return {
    value: next,
    selection: { start: sel.start + prefix.length, end: sel.end + delta },
  };
}

interface ToolbarButtonProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}

function ToolbarButton({ icon, label, onPress }: ToolbarButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.toolbarBtn} accessibilityLabel={label}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

export function RichTextEditor({
  value,
  onChangeText,
  placeholder,
  minHeight,
  readOnly,
  testID,
}: RichTextEditorProps) {
  const inputRef = useRef<TextInput | null>(null);
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  // Control selection for one render after a toolbar edit so the caret lands
  // where we placed it; after that, let the TextInput manage its own caret.
  const [forcedSelection, setForcedSelection] = useState<Selection | null>(null);

  if (readOnly) {
    return <RichTextRenderer value={value} />;
  }

  function apply(transform: (val: string, sel: Selection) => { value: string; selection: Selection }) {
    const result = transform(value, selection);
    onChangeText(result.value);
    setSelection(result.selection);
    setForcedSelection(result.selection);
    // Re-focus so the caret is visible after a toolbar press.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onSelectionChange(ev: NativeSyntheticEvent<TextInputSelectionChangeEventData>) {
    setSelection(ev.nativeEvent.selection);
    if (forcedSelection) setForcedSelection(null);
  }

  const useFlex = minHeight === undefined;

  return (
    <View style={[styles.wrap, useFlex && styles.wrapFlex]}>
      <View style={styles.toolbar}>
        <ToolbarButton icon="format-bold" label="Bold" onPress={() => apply((v, s) => wrap(v, s, '**'))} />
        <ToolbarButton icon="format-italic" label="Italic" onPress={() => apply((v, s) => wrap(v, s, '*'))} />
        <View style={styles.toolbarDivider} />
        <ToolbarButton icon="format-header-2" label="Heading" onPress={() => apply((v, s) => prefixLines(v, s, '## '))} />
        <ToolbarButton icon="format-list-bulleted" label="Bullet list" onPress={() => apply((v, s) => prefixLines(v, s, '- '))} />
        <ToolbarButton icon="format-quote-close" label="Quote" onPress={() => apply((v, s) => prefixLines(v, s, '> '))} />
      </View>
      <TextInput
        ref={inputRef}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={onSelectionChange}
        selection={forcedSelection ?? undefined}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        multiline
        textAlignVertical="top"
        style={[styles.input, useFlex ? styles.inputFlex : { minHeight }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  wrapFlex: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolbarBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  toolbarDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
    marginHorizontal: 4,
  },
  input: {
    padding: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    backgroundColor: colors.background,
  },
  inputFlex: { flex: 1 },
});
