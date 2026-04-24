import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { extractMentionedPageIds, jsonToPlainText } from '@vaultstone/content';
import type { WorldPage } from '@vaultstone/types';
import { colors, radius, spacing } from '@vaultstone/ui';

import { BodyEditorToolbar } from './BodyEditorToolbar';
import { DragHandle } from './DragHandleExtension';
import { ImageUploadModal } from './ImageUploadModal.web';
import { VaultstoneMention } from './MentionExtension';
import { WorldImageNode } from './WorldImageNode';
import { worldImageStyles } from './WorldImageNodeView.web';
import { createMentionSuggestion, type MentionPinItem, type MentionEventItem } from './MentionSuggestion.web';

type Props = {
  initialContent: object | null;
  onChange: (body: object, bodyText: string, bodyRefs: string[]) => void;
  editable?: boolean;
  hideChrome?: boolean;
  stickyToolbar?: boolean;
  placeholder?: string;
  worldId?: string;
  pageId?: string;
  mentionablePages?: WorldPage[];
  mentionablePins?: MentionPinItem[];
  mentionableEvents?: MentionEventItem[];
  getSectionLabel?: (sectionId: string) => string;
  onMentionClick?: (pageId: string) => void;
  onPinMentionClick?: (pinId: string, mapId: string) => void;
};

// Tiptap's internal equality checks are referential, so we need to keep the
// initial content object stable across renders — otherwise every parent
// re-render would reset the editor to `initialContent`.
export function BodyEditor({
  initialContent,
  onChange,
  editable = true,
  hideChrome = false,
  stickyToolbar = false,
  placeholder,
  worldId,
  pageId,
  mentionablePages,
  mentionablePins,
  mentionableEvents,
  getSectionLabel,
  onMentionClick,
  onPinMentionClick,
}: Props) {
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const initialRef = useRef(initialContent && Object.keys(initialContent).length > 0 ? initialContent : undefined);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const onMentionClickRef = useRef(onMentionClick);
  useEffect(() => {
    onMentionClickRef.current = onMentionClick;
  }, [onMentionClick]);
  const onPinMentionClickRef = useRef(onPinMentionClick);
  useEffect(() => {
    onPinMentionClickRef.current = onPinMentionClick;
  }, [onPinMentionClick]);

  // Suggestion handlers read pages/pins/labels via getters so the editor
  // instance, created once, always sees the latest list as the parent
  // re-renders.
  const pagesRef = useRef<WorldPage[]>(mentionablePages ?? []);
  const pinsRef = useRef<MentionPinItem[]>(mentionablePins ?? []);
  const eventsRef = useRef<MentionEventItem[]>(mentionableEvents ?? []);
  const sectionLabelRef = useRef<(id: string) => string>(getSectionLabel ?? (() => ''));
  useEffect(() => {
    pagesRef.current = mentionablePages ?? [];
  }, [mentionablePages]);
  useEffect(() => {
    pinsRef.current = mentionablePins ?? [];
  }, [mentionablePins]);
  useEffect(() => {
    eventsRef.current = mentionableEvents ?? [];
  }, [mentionableEvents]);
  useEffect(() => {
    sectionLabelRef.current = getSectionLabel ?? (() => '');
  }, [getSectionLabel]);

  const mentionExtension = useRef(
    VaultstoneMention.configure({
      HTMLAttributes: { class: 'vaultstone-mention' },
      suggestion: createMentionSuggestion(
        () => pagesRef.current,
        (id) => sectionLabelRef.current(id),
        () => pinsRef.current,
        () => eventsRef.current,
      ),
    }),
  ).current;

  const editor = useEditor({
    extensions: [StarterKit, mentionExtension, WorldImageNode, ...(editable ? [DragHandle] : [])],
    content: initialRef.current,
    editable,
    immediatelyRender: true,
    onUpdate: ({ editor }) => {
      const body = editor.getJSON();
      onChangeRef.current(body, jsonToPlainText(body), extractMentionedPageIds(body));
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

  // Make mention chips act like links. Tiptap renders each mention as an
  // inline <span class="vaultstone-mention" data-id="…">; without this
  // handler, clicking just places the caret. We hook into mousedown so the
  // caret placement never happens in the first place — Notion-style atomic
  // chip behavior.
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;
    const handler = (e: MouseEvent) => {
      const chip = (e.target as HTMLElement | null)?.closest(
        '.vaultstone-mention',
      ) as HTMLElement | null;
      if (!chip) return;
      const id = chip.getAttribute('data-id');
      if (!id) return;
      const kind = chip.getAttribute('data-kind') ?? 'page';
      e.preventDefault();
      e.stopPropagation();
      if (kind === 'pin') {
        const mapId = chip.getAttribute('data-map-id');
        if (mapId) onPinMentionClickRef.current?.(id, mapId);
      } else {
        onMentionClickRef.current?.(id);
      }
    };
    el.addEventListener('mousedown', handler);
    return () => el.removeEventListener('mousedown', handler);
  }, [editor]);

  const handleImageInsert = useCallback(
    (attrs: { imageId: string; alt: string; width: number; height: number }) => {
      if (!editor) return;
      editor.chain().focus().insertWorldImage(attrs).run();
    },
    [editor],
  );

  const canInsertImage = !!worldId && !!pageId && editable;

  if (!editor) return null;

  const showToolbar = !hideChrome && !stickyToolbar;
  const rootStyle = stickyToolbar ? styles.rootSticky
    : hideChrome ? styles.rootBare
    : styles.root;
  const frameStyle = (hideChrome || stickyToolbar) ? styles.editorFrameBare : styles.editorFrame;

  return (
    <View style={rootStyle}>
      {stickyToolbar ? (
        <div className="vaultstone-sticky-toolbar">
          <BodyEditorToolbar
            editor={editor}
            onImagePress={canInsertImage ? () => setImageModalOpen(true) : undefined}
          />
        </div>
      ) : showToolbar ? (
        <BodyEditorToolbar
          editor={editor}
          onImagePress={canInsertImage ? () => setImageModalOpen(true) : undefined}
        />
      ) : null}
      <View style={frameStyle}>
        <div className={editable ? 'vaultstone-body-editor-wrap' : undefined}>
          <EditorContent editor={editor} />
        </div>
      </View>
      <EditorStyles />
      {imageModalOpen && worldId && pageId ? (
        <ImageUploadModal
          worldId={worldId}
          pageId={pageId}
          onInsert={handleImageInsert}
          onClose={() => setImageModalOpen(false)}
        />
      ) : null}
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
            color: ${colors.onSurfaceVariant};
            font-family: 'CormorantGaramond_400Regular', 'Cormorant Garamond', Georgia, serif;
            font-size: 15px;
            line-height: 1.7;
            padding: ${spacing.md}px ${spacing.lg}px;
          }
          .vaultstone-body-editor p {
            margin: 0 0 ${spacing.sm}px 0;
            color: ${colors.onSurfaceVariant};
            font-size: 15px;
            line-height: 1.7;
          }
          .vaultstone-body-editor h1,
          .vaultstone-body-editor h2,
          .vaultstone-body-editor h3 {
            font-family: 'Fraunces_700Bold', 'Fraunces', Georgia, serif;
            font-weight: 700;
            color: ${colors.onSurface};
            letter-spacing: -0.25px;
          }
          .vaultstone-body-editor h1 {
            font-size: 28px;
            line-height: 1.2;
            margin: ${spacing.lg}px 0 ${spacing.sm}px;
          }
          .vaultstone-body-editor h2 {
            font-size: 24px;
            line-height: 1.25;
            margin: 32px 0 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid ${colors.outlineVariant}55;
          }
          .vaultstone-body-editor h3 {
            font-size: 18px;
            line-height: 1.3;
            margin: ${spacing.lg}px 0 ${spacing.sm}px;
          }
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
          .vaultstone-mention {
            display: inline;
            padding: 1px 6px;
            margin: 0 1px;
            border-radius: 3px;
            background: ${colors.primary}14;
            color: ${colors.primary};
            font-family: 'Manrope_500Medium', 'Manrope', system-ui, sans-serif;
            font-style: normal;
            font-size: 14px;
            font-weight: 500;
            border: 1px solid ${colors.primary}33;
            cursor: pointer;
            white-space: nowrap;
          }
          .vaultstone-mention:hover {
            background: ${colors.primary}26;
            border-color: ${colors.primary}55;
          }
          .vaultstone-mention-popup {
            z-index: 1000;
          }
          .vaultstone-mention-list {
            background: ${colors.surfaceContainerHigh};
            border: 1px solid ${colors.outlineVariant}55;
            border-radius: ${radius.lg}px;
            box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
            min-width: 240px;
            max-width: 320px;
            padding: 4px;
            overflow: hidden;
          }
          .vaultstone-mention-empty {
            background: ${colors.surfaceContainerHigh};
            border: 1px solid ${colors.outlineVariant}55;
            border-radius: ${radius.lg}px;
            color: ${colors.onSurfaceVariant};
            padding: 8px 12px;
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 13px;
            font-style: italic;
          }
          .vaultstone-mention-item {
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            background: transparent;
            border: none;
            border-radius: ${radius.lg}px;
            padding: 8px 10px;
            text-align: left;
            cursor: pointer;
            color: ${colors.onSurface};
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
          }
          .vaultstone-mention-item.is-active,
          .vaultstone-mention-item:hover {
            background: ${colors.primaryContainer}33;
          }
          .vaultstone-mention-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 24px;
            height: 24px;
            border-radius: ${radius.lg}px;
            background: ${colors.surfaceContainerHighest};
            color: ${colors.primary};
            font-size: 14px;
          }
          .vaultstone-mention-text {
            display: flex;
            flex-direction: column;
            min-width: 0;
            flex: 1;
          }
          .vaultstone-mention-title {
            font-size: 14px;
            font-weight: 500;
            color: ${colors.onSurface};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .vaultstone-mention-meta {
            font-size: 11px;
            color: ${colors.onSurfaceVariant};
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }
          ${worldImageStyles()}

          /* Sticky toolbar — pinned to top of the scroll container */
          .vaultstone-sticky-toolbar {
            position: sticky;
            top: 0;
            z-index: 10;
            background: ${colors.surfaceCanvas};
            border-bottom: 1px solid ${colors.outlineVariant}22;
            margin: 0 -36px;
            padding: 0 36px;
          }

          /* Drag handle — floating element positioned by the plugin */
          .vaultstone-body-editor-wrap {
            position: relative;
            padding-left: 28px;
          }
          .vaultstone-drag-handle {
            width: 22px;
            height: 22px;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            line-height: 1;
            color: ${colors.outlineVariant}88;
            cursor: grab;
            border-radius: 4px;
            transition: background 0.15s ease, color 0.15s ease, opacity 0.15s ease;
            user-select: none;
            z-index: 5;
          }
          .vaultstone-drag-handle:hover {
            background: ${colors.surfaceContainerHigh};
            color: ${colors.onSurfaceVariant};
          }
          .vaultstone-drag-handle:active {
            cursor: grabbing;
          }
          .vaultstone-drag-ghost {
            position: fixed;
            top: -100px;
            left: -100px;
            background: ${colors.surfaceContainerHigh};
            color: ${colors.onSurface};
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            pointer-events: none;
          }
        `,
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerLowest,
    overflow: 'hidden',
  },
  rootBare: {
    flex: 1,
  },
  rootSticky: {
    flex: 1,
  },
  editorFrame: {
    flex: 1,
    minHeight: 240,
  },
  editorFrameBare: {
    flex: 1,
  },
});
