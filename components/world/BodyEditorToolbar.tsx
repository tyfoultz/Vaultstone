import { Pressable, StyleSheet, View } from 'react-native';
import type { Editor } from '@tiptap/react';
import { Icon, colors, radius, spacing } from '@vaultstone/ui';

type Props = {
  editor: Editor;
};

type IconName = React.ComponentProps<typeof Icon>['name'];

type BtnSpec = {
  key: string;
  icon: IconName;
  label: string;
  isActive: (e: Editor) => boolean;
  run: (e: Editor) => void;
  canRun?: (e: Editor) => boolean;
};

const BUTTONS: BtnSpec[] = [
  {
    key: 'bold',
    icon: 'format-bold',
    label: 'Bold',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
    canRun: (e) => e.can().chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    icon: 'format-italic',
    label: 'Italic',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
    canRun: (e) => e.can().chain().focus().toggleItalic().run(),
  },
  {
    key: 'strike',
    icon: 'strikethrough-s',
    label: 'Strikethrough',
    isActive: (e) => e.isActive('strike'),
    run: (e) => e.chain().focus().toggleStrike().run(),
    canRun: (e) => e.can().chain().focus().toggleStrike().run(),
  },
  {
    key: 'h1',
    icon: 'title',
    label: 'Heading 1',
    isActive: (e) => e.isActive('heading', { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    key: 'h2',
    icon: 'text-fields',
    label: 'Heading 2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: 'bullet',
    icon: 'format-list-bulleted',
    label: 'Bullet list',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'ordered',
    icon: 'format-list-numbered',
    label: 'Numbered list',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'quote',
    icon: 'format-quote',
    label: 'Quote',
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: 'code',
    icon: 'code',
    label: 'Code',
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
];

export function BodyEditorToolbar({ editor }: Props) {
  return (
    <View style={styles.root}>
      {BUTTONS.map((btn) => {
        const active = btn.isActive(editor);
        const disabled = btn.canRun ? !btn.canRun(editor) : false;
        return (
          <Pressable
            key={btn.key}
            onPress={() => btn.run(editor)}
            disabled={disabled}
            style={[
              styles.btn,
              active && styles.btnActive,
              disabled && styles.btnDisabled,
            ]}
            accessibilityLabel={btn.label}
          >
            <Icon
              name={btn.icon}
              size={18}
              color={active ? colors.primary : disabled ? colors.outline : colors.onSurfaceVariant}
            />
          </Pressable>
        );
      })}
      <View style={styles.spacer} />
      <Pressable
        onPress={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        style={[styles.btn, !editor.can().undo() && styles.btnDisabled]}
        accessibilityLabel="Undo"
      >
        <Icon name="undo" size={18} color={editor.can().undo() ? colors.onSurfaceVariant : colors.outline} />
      </Pressable>
      <Pressable
        onPress={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        style={[styles.btn, !editor.can().redo() && styles.btnDisabled]}
        accessibilityLabel="Redo"
      >
        <Icon name="redo" size={18} color={editor.can().redo() ? colors.onSurfaceVariant : colors.outline} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
    backgroundColor: colors.surfaceContainer,
    flexWrap: 'wrap',
  },
  btn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  btnActive: {
    backgroundColor: colors.primaryContainer + '33',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  spacer: {
    flex: 1,
    minWidth: spacing.sm,
  },
});
