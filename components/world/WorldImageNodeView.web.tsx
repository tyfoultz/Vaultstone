import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { getWorldImageSignedUrlById, updateWorldImageCaption } from '@vaultstone/api';
import { colors, spacing } from '@vaultstone/ui';

type SignedUrlEntry = { url: string; expiresAt: number };
const urlCache = new Map<string, SignedUrlEntry>();
const URL_TTL_MS = 50 * 60 * 1000; // refresh 10 min before 1-hour expiry

async function resolveUrl(imageId: string): Promise<string | null> {
  const cached = urlCache.get(imageId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await getWorldImageSignedUrlById(imageId);
  if (error || !data?.signedUrl) return null;
  urlCache.set(imageId, { url: data.signedUrl, expiresAt: Date.now() + URL_TTL_MS });
  return data.signedUrl;
}

export function WorldImageNodeView(props: NodeViewProps) {
  const { node, selected, editor, getPos } = props;
  const imageId = node.attrs.imageId as string;
  const alt = (node.attrs.alt as string) ?? '';
  // Caption is the display copy beneath the image; alt is the
  // screen-reader label. Older nodes (pre-caption migration) have
  // alt set but no caption — fall back to alt so existing canvases
  // don't suddenly lose their captions.
  const caption = ((node.attrs.caption as string) ?? '') || alt;
  const width = (node.attrs.width as number) ?? 0;
  const height = (node.attrs.height as number) ?? 0;
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Caption editor state — opens on right-click, anchored to the
  // image wrapper. Position tracks the click coordinates so the
  // popover appears where the user gestured. Saves both to Tiptap
  // (via setWorldImageCaption command) and to world_images.caption
  // in the same submit handler.
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPos, setEditorPos] = useState<{ x: number; y: number } | null>(null);
  const [draftCaption, setDraftCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!imageId) {
      setLoading(false);
      setError(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    resolveUrl(imageId).then((url) => {
      if (cancelled) return;
      if (url) {
        setSrc(url);
      } else {
        setError(true);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [imageId]);

  const aspectRatio = width && height ? width / height : undefined;

  function openCaptionEditor(e: React.MouseEvent<HTMLDivElement>) {
    if (!editor.isEditable || !imageId) return;
    e.preventDefault();
    e.stopPropagation();
    // Anchor the popover to the click, clamped inside the canvas
    // so it can't render off the right/bottom edge. The wrapper's
    // bounding rect gives us the local origin.
    const rect = wrapperRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;
    setEditorPos({ x, y });
    setDraftCaption((node.attrs.caption as string) ?? '');
    setEditorOpen(true);
  }

  async function commitCaption() {
    if (!imageId || saving) return;
    setSaving(true);
    // Patch the DB row first; if it fails the user keeps their draft
    // and the canvas reflects no change. On success, mirror the
    // value into the Tiptap node so the canvas re-renders without
    // a refetch.
    const { error: dbErr } = await updateWorldImageCaption(imageId, draftCaption);
    setSaving(false);
    if (dbErr) return; // surface to user in a follow-up; v1 fails silent
    // Select the node by position so setWorldImageCaption finds it
    // even when the user clicked a different node between opening
    // the editor and saving.
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos != null) {
      editor.chain().setNodeSelection(pos).setWorldImageCaption(draftCaption).run();
    } else {
      editor.chain().setWorldImageCaption(draftCaption).run();
    }
    setEditorOpen(false);
  }

  function cancelCaption() {
    setEditorOpen(false);
  }

  return (
    <NodeViewWrapper
      ref={wrapperRef as never}
      className={`world-image-wrapper${selected ? ' selected' : ''}`}
      data-drag-handle=""
      onContextMenu={openCaptionEditor as never}
    >
      {loading ? (
        <div className="world-image-loading" style={{ aspectRatio }}>
          <span className="world-image-loading-text">Loading image…</span>
        </div>
      ) : error || !src ? (
        <div className="world-image-error">
          <span className="world-image-error-icon">⚠</span>
          <span className="world-image-error-text">Image unavailable</span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt || ''}
          className="world-image-img"
          style={{ aspectRatio }}
          draggable={false}
        />
      )}
      {caption ? <div className="world-image-caption">{caption}</div> : null}
      {editorOpen && editorPos ? (
        <div
          className="world-image-caption-editor"
          style={{ left: editorPos.x, top: editorPos.y }}
          // Stop clicks inside the editor from bubbling to the
          // canvas (which would deselect the node).
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="world-image-caption-editor-label">Caption</div>
          <textarea
            value={draftCaption}
            onChange={(e) => setDraftCaption(e.target.value)}
            placeholder="What is shown? (optional)"
            className="world-image-caption-editor-input"
            autoFocus
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelCaption();
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void commitCaption();
              }
            }}
          />
          <div className="world-image-caption-editor-row">
            <button
              type="button"
              className="world-image-caption-editor-btn world-image-caption-editor-btn-ghost"
              onClick={cancelCaption}
            >
              Cancel
            </button>
            <button
              type="button"
              className="world-image-caption-editor-btn world-image-caption-editor-btn-primary"
              onClick={commitCaption}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

export function worldImageStyles(): string {
  return `
    .world-image-wrapper {
      margin: ${spacing.md}px 0;
      border-radius: 8px;
      overflow: visible;
      position: relative;
      cursor: default;
    }
    .world-image-wrapper.selected {
      outline: 2px solid ${colors.primary};
      outline-offset: 2px;
    }
    .world-image-img {
      display: block;
      width: 100%;
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      object-fit: cover;
    }
    .world-image-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 120px;
      background: ${colors.surfaceContainerHigh};
      border-radius: 8px;
      border: 1px dashed ${colors.outlineVariant};
    }
    .world-image-loading-text {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 13px;
      color: ${colors.outline};
      font-style: italic;
    }
    .world-image-error {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 80px;
      background: ${colors.dangerContainer}22;
      border: 1px solid ${colors.hpDanger}33;
      border-radius: 8px;
      padding: 16px;
    }
    .world-image-error-icon {
      font-size: 18px;
      color: ${colors.hpDanger};
    }
    .world-image-error-text {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 13px;
      color: ${colors.hpDanger};
    }
    .world-image-caption {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 12px;
      color: ${colors.outline};
      text-align: center;
      padding: 6px 0 2px;
      font-style: italic;
    }
    .world-image-caption-editor {
      position: absolute;
      z-index: 50;
      width: 280px;
      background: ${colors.surfaceContainerHigh};
      border: 1px solid ${colors.outlineVariant};
      border-radius: 8px;
      padding: 10px 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .world-image-caption-editor-label {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: ${colors.outline};
    }
    .world-image-caption-editor-input {
      width: 100%;
      box-sizing: border-box;
      background: ${colors.surfaceContainer};
      border: 1px solid ${colors.outlineVariant};
      border-radius: 6px;
      color: ${colors.onSurface};
      padding: 8px 10px;
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      resize: vertical;
      min-height: 56px;
      outline: none;
    }
    .world-image-caption-editor-input:focus {
      border-color: ${colors.primary};
    }
    .world-image-caption-editor-row {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .world-image-caption-editor-btn {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .world-image-caption-editor-btn-ghost {
      background: transparent;
      color: ${colors.onSurfaceVariant};
      border-color: ${colors.outlineVariant};
    }
    .world-image-caption-editor-btn-primary {
      background: ${colors.primary};
      color: ${colors.onPrimary};
    }
    .world-image-caption-editor-btn-primary:disabled {
      opacity: 0.6;
      cursor: progress;
    }
  `;
}
