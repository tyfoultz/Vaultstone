import { useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '@vaultstone/ui';

import { jsonToPlainText } from '@vaultstone/content';

type Props = {
  initialContent: object | null;
  onChange: (body: object, bodyText: string, bodyRefs: string[]) => void;
  editable?: boolean;
  placeholder?: string;
  hideChrome?: boolean;
  stickyToolbar?: boolean;
  // Web-only — accepted here so callers can stay platform-agnostic.
  worldId?: string;
  pageId?: string;
  mentionablePages?: unknown;
  mentionablePins?: unknown;
  mentionableEvents?: unknown;
  getSectionLabel?: (sectionId: string) => string;
  onMentionClick?: (pageId: string) => void;
  onPinMentionClick?: (pinId: string, mapId: string) => void;
};

// Native fallback for Phase 3a — plain TextInput. The web variant
// (BodyEditor.web.tsx) renders the full Tiptap editor via @tiptap/react.
// We keep the API identical so page-detail screens don't care about the
// platform; 10tap's webview-based editor lands in a later slice.
export function BodyEditor({ initialContent, onChange, editable = true, placeholder }: Props) {
  const initialText = useMemo(() => jsonToPlainText(initialContent), [initialContent]);
  const [value, setValue] = useState(initialText);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function handleChange(next: string) {
    setValue(next);
    const doc = textToTiptapDoc(next);
    onChangeRef.current(doc, next, []);
  }

  return (
    <View style={styles.root}>
      <TextInput
        value={value}
        onChangeText={handleChange}
        editable={editable}
        multiline
        placeholder={placeholder ?? 'Begin the chronicle…'}
        placeholderTextColor={colors.outline}
        style={styles.input}
        textAlignVertical="top"
      />
    </View>
  );
}

function textToTiptapDoc(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((chunk) => ({
    type: 'paragraph',
    content: chunk ? [{ type: 'text', text: chunk }] : [],
  }));
  return { type: 'doc', content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }] };
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLowest,
    minHeight: 240,
    padding: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 220,
    color: colors.onSurface,
    fontSize: 16,
    lineHeight: 24,
  },
});
