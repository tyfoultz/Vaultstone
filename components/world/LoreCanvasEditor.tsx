import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

type CanvasBlock = {
  id: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  html: string;
};

type MentionablePage = {
  id: string;
  title: string;
  page_kind: string;
  section_id: string;
};

type Props = {
  initialBlocks: CanvasBlock[] | null;
  onChange: (blocks: CanvasBlock[], plainText: string, bodyRefs: string[]) => void;
  editable?: boolean;
  minHeight?: number;
  mentionablePages?: MentionablePage[];
  getSectionLabel?: (sectionId: string) => string;
  onMentionClick?: (pageId: string) => void;
};

const GRID = 12;
function snap(v: number) {
  return Math.round(v / GRID) * GRID;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractRefs(html: string): string[] {
  const ids: string[] = [];
  const re = /data-id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

function blocksToPlainText(blocks: CanvasBlock[]): string {
  return blocks.map((b) => stripHtml(b.html)).filter(Boolean).join('\n\n');
}

function extractAllRefs(blocks: CanvasBlock[]): string[] {
  const ids = new Set<string>();
  for (const b of blocks) {
    for (const id of extractRefs(b.html)) ids.add(id);
  }
  return Array.from(ids);
}

// ── Draggable Block ──────────────────────────────────────────────────────

function DraggableBlock({
  block,
  selected,
  onSelect,
  onDragEnd,
  onEdit,
  canvasScale,
}: {
  block: CanvasBlock;
  selected: boolean;
  onSelect: () => void;
  onDragEnd: (x: number, y: number) => void;
  onEdit: () => void;
  canvasScale: Animated.SharedValue<number>;
}) {
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .onStart(() => {
      isDragging.value = true;
      dragX.value = 0;
      dragY.value = 0;
    })
    .onUpdate((e) => {
      dragX.value = e.translationX / canvasScale.value;
      dragY.value = e.translationY / canvasScale.value;
    })
    .onEnd(() => {
      isDragging.value = false;
      const newX = snap(block.x + dragX.value);
      const newY = snap(block.y + dragY.value);
      dragX.value = 0;
      dragY.value = 0;
      onDragEnd(newX, newY);
    });

  const tapGesture = Gesture.Tap().onEnd(() => {
    onSelect();
  });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      onEdit();
    });

  const composed = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(tapGesture, dragGesture));

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
    ],
    zIndex: isDragging.value ? 100 : selected ? 10 : 1,
    opacity: isDragging.value ? 0.8 : 1,
  }));

  const text = stripHtml(block.html);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          blockStyles.block,
          {
            left: block.x,
            top: block.y,
            width: block.width,
          },
          selected && blockStyles.blockSelected,
          animStyle,
        ]}
      >
        <Text
          variant="body-md"
          style={{ color: colors.onSurface, lineHeight: 20 }}
        >
          {text || 'Empty block'}
        </Text>
      </Animated.View>
    </GestureDetector>
  );
}

// ── Main Canvas Editor ───────────────────────────────────────────────────

export function LoreCanvasEditor({ initialBlocks, onChange, editable = true }: Props) {
  const [blocks, setBlocks] = useState<CanvasBlock[]>(initialBlocks ?? []);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);

  const emitChange = useCallback((updated: CanvasBlock[]) => {
    onChangeRef.current(updated, blocksToPlainText(updated), extractAllRefs(updated));
  }, []);

  const handleBlockDragEnd = useCallback((blockId: string, newX: number, newY: number) => {
    setBlocks((prev) => {
      const next = prev.map((b) =>
        b.id === blockId ? { ...b, x: Math.max(0, newX), y: Math.max(0, newY) } : b,
      );
      blocksRef.current = next;
      emitChange(next);
      return next;
    });
  }, [emitChange]);

  const handleAddBlock = useCallback(() => {
    const maxY = blocks.reduce((max, b) => Math.max(max, b.y + (b.height ?? 80)), 0);
    const newBlock: CanvasBlock = {
      id: uid(),
      x: GRID,
      y: snap(maxY + GRID * 2),
      width: 280,
      html: '<p></p>',
    };
    const next = [...blocks, newBlock];
    setBlocks(next);
    blocksRef.current = next;
    setSelectedId(newBlock.id);
    setEditingId(newBlock.id);
    setEditText('');
    emitChange(next);
  }, [blocks, emitChange]);

  const handleEditBlock = useCallback((blockId: string) => {
    if (!editable) return;
    const block = blocksRef.current.find((b) => b.id === blockId);
    if (!block) return;
    setEditingId(blockId);
    setEditText(stripHtml(block.html));
    setSelectedId(blockId);
  }, [editable]);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const html = `<p>${editText.replace(/\n/g, '</p><p>')}</p>`;
    setBlocks((prev) => {
      const next = prev.map((b) =>
        b.id === editingId ? { ...b, html } : b,
      );
      blocksRef.current = next;
      emitChange(next);
      return next;
    });
    setEditingId(null);
    setEditText('');
  }, [editingId, editText, emitChange]);

  const zoomPercent = useMemo(() => Math.round(scale.value * 100), []);

  // Canvas gestures (pinch + pan)
  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.max(0.3, Math.min(3, savedScale.value * e.scale));
    });

  const pan = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      savedTX.value = translateX.value;
      savedTY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = savedTX.value + e.translationX;
      translateY.value = savedTY.value + e.translationY;
    });

  const canvasGesture = Gesture.Simultaneous(pinch, pan);

  const canvasAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const contentHeight = useMemo(() => {
    let maxBottom = 200;
    for (const b of blocks) {
      maxBottom = Math.max(maxBottom, b.y + (b.height ?? 80) + 120);
    }
    return maxBottom;
  }, [blocks]);

  if (blocks.length === 0 && !editable) {
    return (
      <View style={styles.emptyState}>
        <Icon name="dashboard" size={32} color={colors.outlineVariant} />
        <Text variant="body-md" style={{ color: colors.onSurfaceVariant, marginTop: spacing.sm }}>
          No canvas content yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <GestureHandlerRootView style={styles.canvasContainer}>
        <GestureDetector gesture={canvasGesture}>
          <Animated.View style={[styles.canvasInner, { height: contentHeight }, canvasAnimStyle]}>
            {blocks.map((block) => (
              <DraggableBlock
                key={block.id}
                block={block}
                selected={selectedId === block.id}
                onSelect={() => setSelectedId(selectedId === block.id ? null : block.id)}
                onDragEnd={(x, y) => handleBlockDragEnd(block.id, x, y)}
                onEdit={() => handleEditBlock(block.id)}
                canvasScale={scale}
              />
            ))}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>

      {/* Floating controls */}
      {editable ? (
        <View style={styles.fab}>
          <Pressable style={styles.fabBtn} onPress={handleAddBlock}>
            <Icon name="add" size={20} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}

      {/* Inline text editor (bottom sheet) */}
      {editingId ? (
        <View style={styles.editSheet}>
          <View style={styles.editHeader}>
            <Text variant="label-sm" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
              Edit block
            </Text>
            <Pressable onPress={handleSaveEdit} hitSlop={8}>
              <Text variant="label-sm" weight="bold" style={{ color: colors.primary }}>
                Done
              </Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.editInput}
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
            placeholder="Type here..."
            placeholderTextColor={colors.outlineVariant}
            onSubmitEditing={handleSaveEdit}
          />
        </View>
      ) : null}
    </View>
  );
}

const blockStyles = StyleSheet.create({
  block: {
    position: 'absolute',
    padding: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
    backgroundColor: colors.surfaceCanvas,
    minHeight: 40,
  },
  blockSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryContainer + '11',
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: 'relative',
  },
  canvasContainer: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerLowest,
  },
  canvasInner: {
    position: 'relative',
    width: '200%',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    minHeight: 200,
  },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.md,
    gap: spacing.sm,
  },
  fabBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  editSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surfaceContainerHigh,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
    padding: spacing.md,
    maxHeight: '50%',
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  editInput: {
    color: colors.onSurface,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 80,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
});
