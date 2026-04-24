import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, colors, radius, spacing } from '@vaultstone/ui';

type CanvasBlock = {
  id: string;
  x: number;
  y: number;
  width: number;
  height?: number;
  html: string;
};

type Props = {
  initialBlocks: CanvasBlock[] | null;
  onChange: (blocks: CanvasBlock[], plainText: string) => void;
  editable?: boolean;
  minHeight?: number;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function blocksToPlainText(blocks: CanvasBlock[]): string {
  const el = document.createElement('div');
  return blocks.map((b) => {
    el.innerHTML = b.html;
    return el.textContent ?? '';
  }).filter(Boolean).join('\n\n');
}

type ToolbarAction = {
  key: string;
  icon: string;
  command: string;
  arg?: string;
  label: string;
};

const TOOLBAR: ToolbarAction[] = [
  { key: 'bold', icon: 'format-bold', command: 'bold', label: 'Bold' },
  { key: 'italic', icon: 'format-italic', command: 'italic', label: 'Italic' },
  { key: 'underline', icon: 'format-underlined', command: 'underline', label: 'Underline' },
  { key: 'strike', icon: 'strikethrough-s', command: 'strikeThrough', label: 'Strikethrough' },
  { key: 'h1', icon: 'title', command: 'formatBlock', arg: 'h2', label: 'Heading' },
  { key: 'ul', icon: 'format-list-bulleted', command: 'insertUnorderedList', label: 'Bullet list' },
  { key: 'ol', icon: 'format-list-numbered', command: 'insertOrderedList', label: 'Numbered list' },
];

function BlockContent({ id, initialHtml, editable, onInput, onFocus, onBlur }: {
  id: string;
  initialHtml: string;
  editable: boolean;
  onInput: (id: string, html: string) => void;
  onFocus: (id: string) => void;
  onBlur: (id: string, text: string, html: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initialHtml);

  useEffect(() => {
    if (elRef.current && initialRef.current) {
      elRef.current.innerHTML = initialRef.current;
    }
  }, []);

  return (
    <div
      ref={elRef}
      className="lore-block-content"
      contentEditable={editable}
      suppressContentEditableWarning
      onInput={() => {
        if (elRef.current) onInput(id, elRef.current.innerHTML);
      }}
      onFocus={() => onFocus(id)}
      onBlur={() => {
        if (elRef.current) {
          onBlur(id, (elRef.current.textContent ?? '').trim(), elRef.current.innerHTML);
        }
      }}
    />
  );
}

export function LoreCanvasEditor({ initialBlocks, onChange, editable = true, minHeight = 600 }: Props) {
  const [blocks, setBlocks] = useState<CanvasBlock[]>(initialBlocks ?? []);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlRef = useRef<Record<string, string>>({});

  for (const b of blocks) {
    if (!(b.id in htmlRef.current)) htmlRef.current[b.id] = b.html;
  }

  function buildSnapshot(base?: CanvasBlock[]): CanvasBlock[] {
    return (base ?? blocksRef.current).map((b) => ({
      ...b,
      html: htmlRef.current[b.id] ?? b.html,
    }));
  }

  function emitChange(next?: CanvasBlock[]) {
    if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
    changeTimerRef.current = setTimeout(() => {
      const final = buildSnapshot(next);
      onChangeRef.current(final, blocksToPlainText(final));
    }, 800);
  }

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable) return;
    const target = e.target as HTMLElement;
    if (target !== canvasRef.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left - 32);
    const y = Math.max(0, e.clientY - rect.top - 12);

    const id = uid();
    const newBlock: CanvasBlock = { id, x, y, width: 320, html: '' };
    htmlRef.current[id] = '';
    setBlocks((prev) => [...prev, newBlock]);
    setFocusedId(id);

    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-block-id="${id}"] .lore-block-content`) as HTMLElement;
      el?.focus();
    });
  }, [editable]);

  function handleBlockInput(id: string, html: string) {
    htmlRef.current[id] = html;
    emitChange();
  }

  function handleBlockBlur(id: string, text: string, html: string) {
    if (text.length === 0) {
      delete htmlRef.current[id];
      setBlocks((prev) => {
        const next = prev.filter((b) => b.id !== id);
        emitChange(next);
        return next;
      });
      setFocusedId(null);
      return;
    }
    htmlRef.current[id] = html;
    setBlocks((prev) => {
      const next = prev.map((b) => b.id === id ? { ...b, html } : b);
      emitChange(next);
      return next;
    });
  }

  function handleDeleteBlock(id: string) {
    delete htmlRef.current[id];
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      emitChange(next);
      return next;
    });
    setFocusedId(null);
  }

  function handleDragStart(id: string, e: React.MouseEvent) {
    e.preventDefault();
    const block = blocksRef.current.find((b) => b.id === id);
    if (!block || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left - block.x,
      y: e.clientY - rect.top - block.y,
    };
    setDraggingId(id);

    function onMove(ev: MouseEvent) {
      if (!canvasRef.current) return;
      const cr = canvasRef.current.getBoundingClientRect();
      const nx = Math.max(0, ev.clientX - cr.left - dragOffset.current.x);
      const ny = Math.max(0, ev.clientY - cr.top - dragOffset.current.y);
      setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, x: nx, y: ny } : b));
    }

    function onUp() {
      setDraggingId(null);
      emitChange();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleResizeStart(id: string, edge: 'right' | 'bottom' | 'corner', e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const block = blocksRef.current.find((b) => b.id === id);
    if (!block) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = block.width;
    const startH = block.height ?? 0;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setBlocks((prev) => prev.map((b) => {
        if (b.id !== id) return b;
        const patch: Partial<CanvasBlock> = {};
        if (edge === 'right' || edge === 'corner') patch.width = Math.max(120, startW + dx);
        if (edge === 'bottom' || edge === 'corner') patch.height = Math.max(40, (startH || 40) + dy);
        return { ...b, ...patch };
      }));
    }

    function onUp() {
      emitChange();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleToolbarAction(command: string, arg?: string) {
    document.execCommand(command, false, arg);
  }

  return (
    <View style={styles.root}>
      <CanvasStyles />
      {editable ? (
        <div className="lore-toolbar">
          {TOOLBAR.map((btn) => (
            <button
              key={btn.key}
              className="lore-toolbar-btn"
              onClick={() => handleToolbarAction(btn.command, btn.arg)}
              title={btn.label}
              type="button"
            >
              <Icon
                name={btn.icon as React.ComponentProps<typeof Icon>['name']}
                size={18}
                color={colors.onSurfaceVariant}
              />
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={canvasRef}
        className="lore-canvas"
        onClick={handleCanvasClick}
        style={{ minHeight: 'calc(100vh - 160px)', position: 'relative', cursor: editable ? 'text' : 'default' }}
      >
        {blocks.map((block) => (
          <div
            key={block.id}
            data-block-id={block.id}
            className={`lore-block ${focusedId === block.id ? 'lore-block-focused' : ''} ${draggingId === block.id ? 'lore-block-dragging' : ''}`}
            style={{
              position: 'absolute',
              left: block.x,
              top: block.y,
              width: block.width,
              ...(block.height ? { height: block.height, overflow: 'auto' } : {}),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {editable ? (
              <div
                className="lore-block-handle"
                onMouseDown={(e) => handleDragStart(block.id, e)}
                title="Drag to move"
              >
                ⠿
              </div>
            ) : null}
            <BlockContent
              id={block.id}
              initialHtml={block.html}
              editable={editable}
              onInput={handleBlockInput}
              onFocus={setFocusedId}
              onBlur={handleBlockBlur}
            />
            {editable && focusedId === block.id ? (
              <>
                <button
                  className="lore-block-delete"
                  onMouseDown={(e) => { e.preventDefault(); handleDeleteBlock(block.id); }}
                  title="Delete block"
                  type="button"
                >
                  ×
                </button>
                <div className="lore-resize-right" onMouseDown={(e) => handleResizeStart(block.id, 'right', e)} />
                <div className="lore-resize-bottom" onMouseDown={(e) => handleResizeStart(block.id, 'bottom', e)} />
                <div className="lore-resize-corner" onMouseDown={(e) => handleResizeStart(block.id, 'corner', e)} />
              </>
            ) : null}
          </div>
        ))}
        {blocks.length === 0 && editable ? (
          <div className="lore-canvas-empty">
            Click anywhere to start writing…
          </div>
        ) : null}
      </div>
    </View>
  );
}

function CanvasStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
          .lore-toolbar {
            display: flex;
            align-items: center;
            gap: 2px;
            padding: 6px 8px;
            background: ${colors.surfaceContainer};
            border-bottom: 1px solid ${colors.outlineVariant}22;
            position: sticky;
            top: 0;
            z-index: 10;
          }
          .lore-toolbar-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border: none;
            background: transparent;
            border-radius: 6px;
            cursor: pointer;
            padding: 0;
          }
          .lore-toolbar-btn:hover {
            background: ${colors.surfaceContainerHigh};
          }
          .lore-canvas {
            background: ${colors.surfaceCanvas};
            border: 1px solid ${colors.outlineVariant}22;
            border-radius: ${radius.lg}px;
            overflow: hidden;
          }
          .lore-canvas-empty {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: ${colors.outline};
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 15px;
            font-style: italic;
            pointer-events: none;
          }
          .lore-block {
            border: 1px solid transparent;
            border-radius: 6px;
            padding: 8px 12px;
            padding-left: 28px;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
            min-height: 24px;
          }
          .lore-block:hover {
            border-color: ${colors.outlineVariant}33;
          }
          .lore-block-focused {
            border-color: ${colors.primary}44 !important;
            box-shadow: 0 0 0 1px ${colors.primary}22;
          }
          .lore-block-dragging {
            opacity: 0.7;
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          }
          .lore-block-handle {
            position: absolute;
            left: 4px;
            top: 8px;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: ${colors.outlineVariant};
            cursor: grab;
            border-radius: 4px;
            user-select: none;
            transition: color 0.15s, background 0.15s;
          }
          .lore-block-handle:hover {
            color: ${colors.onSurfaceVariant};
            background: ${colors.surfaceContainerHigh};
          }
          .lore-block-handle:active {
            cursor: grabbing;
          }
          .lore-block-content {
            outline: none;
            color: ${colors.onSurfaceVariant};
            font-family: 'CormorantGaramond_400Regular', 'Cormorant Garamond', Georgia, serif;
            font-size: 15px;
            line-height: 1.7;
            min-height: 1.7em;
            white-space: pre-wrap;
            word-wrap: break-word;
          }
          .lore-block-content p {
            margin: 0 0 4px 0;
          }
          .lore-block-content h1, .lore-block-content h2, .lore-block-content h3 {
            font-family: 'Fraunces_700Bold', 'Fraunces', Georgia, serif;
            font-weight: 700;
            color: ${colors.onSurface};
            margin: 0 0 4px 0;
          }
          .lore-block-content h2 { font-size: 1.4em; }
          .lore-block-content h3 { font-size: 1.15em; }
          .lore-block-content ul, .lore-block-content ol {
            margin: 0 0 4px 0;
            padding-left: 20px;
          }
          .lore-block-delete {
            position: absolute;
            top: 4px;
            right: 4px;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            background: ${colors.surfaceContainerHigh};
            color: ${colors.outline};
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            line-height: 1;
            opacity: 0.6;
            transition: opacity 0.15s;
          }
          .lore-block-delete:hover {
            opacity: 1;
            color: ${colors.hpDanger};
          }
          .lore-resize-right {
            position: absolute;
            top: 8px;
            right: -3px;
            bottom: 8px;
            width: 6px;
            cursor: ew-resize;
            border-radius: 3px;
            transition: background 0.15s;
          }
          .lore-resize-right:hover {
            background: ${colors.primary}44;
          }
          .lore-resize-bottom {
            position: absolute;
            left: 8px;
            right: 8px;
            bottom: -3px;
            height: 6px;
            cursor: ns-resize;
            border-radius: 3px;
            transition: background 0.15s;
          }
          .lore-resize-bottom:hover {
            background: ${colors.primary}44;
          }
          .lore-resize-corner {
            position: absolute;
            right: -4px;
            bottom: -4px;
            width: 12px;
            height: 12px;
            cursor: nwse-resize;
            border-radius: 3px;
            transition: background 0.15s;
          }
          .lore-resize-corner:hover {
            background: ${colors.primary}44;
          }
        `,
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
