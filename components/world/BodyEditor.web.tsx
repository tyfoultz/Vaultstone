import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { jsonToPlainText } from '@vaultstone/content';
import { colors, radius, spacing } from '@vaultstone/ui';

import { BodyEditorToolbar } from './BodyEditorToolbar';

type Props = {
  initialContent: object | null;
  onChange: (body: object, bodyText: string) => void;
  editable?: boolean;
  placeholder?: string;
};

// Tiptap's internal equality checks are referential, so we need to keep the
// initial content object stable across renders — otherwise every parent
// re-render would reset the editor to `initialContent`.
export function BodyEditor({ initialContent, onChange, editable = true, placeholder }: Props) {
  const initialRef = useRef(initialContent && Object.keys(initialContent).length > 0 ? initialContent : undefined);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialRef.current,
    editable,
    immediatelyRender: true,
    onUpdate: ({ editor }) => {
      const body = editor.getJSON();
      onChangeRef.current(body, jsonToPlainText(body));
    },
    editorProps: {
      attributes: {
        class: 'vaultstone-body-editor',
        'data-placeholder': placeholder ?? 'Begin the chronicle…',
      },
    },
  });

  // Toggle editable without recreating the editor instance.
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  if (!editor) return null;

  return (
    <View style={styles.root}>
      <BodyEditorToolbar editor={editor} />
      <View style={styles.editorFrame}>
        {/* EditorContent renders a plain HTML div; we wrap it in a styled View. */}
        <EditorContent editor={editor} />
      </View>
      <EditorStyles />
    </View>
  );
}

function EditorStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          .vaultstone-body-editor {
            min-height: 240px;
            outline: none;
            color: ${colors.onSurface};
            font-family: 'CormorantGaramond_400Regular', 'Cormorant Garamond', Georgia, serif;
            font-size: 17px;
            line-height: 1.7;
            padding: ${spacing.md}px ${spacing.lg}px;
          }
          .vaultstone-body-editor p { margin: 0 0 ${spacing.sm}px 0; }
          .vaultstone-body-editor h1,
          .vaultstone-body-editor h2,
          .vaultstone-body-editor h3 {
            font-family: 'Fraunces_700Bold', 'Fraunces', Georgia, serif;
            font-weight: 700;
            color: ${colors.onSurface};
            margin: ${spacing.lg}px 0 ${spacing.sm}px;
            letter-spacing: -0.25px;
          }
          .vaultstone-body-editor h1 { font-size: 28px; line-height: 1.2; }
          .vaultstone-body-editor h2 { font-size: 22px; line-height: 1.25; }
          .vaultstone-body-editor h3 { font-size: 18px; line-height: 1.3; }
          .vaultstone-body-editor ul,
          .vaultstone-body-editor ol {
            margin: 0 0 ${spacing.sm}px ${spacing.md}px;
            padding-left: ${spacing.md}px;
          }
          .vaultstone-body-editor li { margin-bottom: 4px; }
          .vaultstone-body-editor blockquote {
            border-left: 3px solid ${colors.primaryContainer};
            padding-left: ${spacing.md}px;
            margin: ${spacing.md}px 0;
            color: ${colors.onSurfaceVariant};
            font-style: italic;
          }
          .vaultstone-body-editor code {
            background: ${colors.surfaceContainerHigh};
            padding: 1px 6px;
            border-radius: 4px;
            font-family: 'JetBrains Mono', ui-monospace, monospace;
            font-size: 14px;
          }
          .vaultstone-body-editor pre {
            background: ${colors.surfaceContainerLowest};
            padding: ${spacing.md}px;
            border-radius: ${radius.lg}px;
            overflow-x: auto;
          }
          .vaultstone-body-editor pre code {
            background: transparent;
            padding: 0;
          }
          .vaultstone-body-editor p.is-editor-empty:first-child::before {
            color: ${colors.outline};
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
            font-style: italic;
          }
        `,
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLowest,
    overflow: 'hidden',
  },
  editorFrame: {
    minHeight: 240,
  },
});
