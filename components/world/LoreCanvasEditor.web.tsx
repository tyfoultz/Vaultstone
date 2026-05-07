import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, colors, radius, spacing, useBreakpoint } from '@vaultstone/ui';
import {
  createWorldImage,
  getCampaignsForWorld,
  getWorldImageSignedUrlById,
  updateWorldImageCaption,
  uploadWorldImage,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { ImageCropModal } from '@vaultstone/ui';
import { commitPin, decidePinFlow, type PinSlot } from './pinImageWithCrop';

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
  /** World + page context for image uploads. When set, paste/upload
   *  routes through `world_images` so images become real records
   *  (with caption + signed-URL src + a `data-world-image-id`
   *  attribute on the rendered <img>). The DM can then right-click
   *  any such image to pin it to the campaign window pane.
   *  Optional because some embeds (legacy / preview) don't have a
   *  page context — those still fall back to data-URL inserts. */
  worldId?: string;
  pageId?: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const GRID = 12;
function snap(v: number) {
  return Math.round(v / GRID) * GRID;
}

function blockHasContent(el: HTMLElement): boolean {
  if ((el.textContent ?? '').trim().length > 0) return true;
  if (el.querySelector('img')) return true;
  if (el.querySelector('table')) return true;
  return false;
}

function blocksToPlainText(blocks: CanvasBlock[]): string {
  const el = document.createElement('div');
  return blocks.map((b) => {
    el.innerHTML = b.html;
    return el.textContent ?? '';
  }).filter(Boolean).join('\n\n');
}

function extractRefsFromBlocks(blocks: CanvasBlock[]): string[] {
  const el = document.createElement('div');
  const ids = new Set<string>();
  for (const b of blocks) {
    el.innerHTML = b.html;
    el.querySelectorAll('.vaultstone-mention[data-id]').forEach((m) => {
      const id = m.getAttribute('data-id');
      const kind = m.getAttribute('data-kind');
      if (id && (!kind || kind === 'page')) ids.add(id);
    });
  }
  return Array.from(ids);
}

const MENTION_KIND_ICON: Record<string, string> = {
  npc: '👤',
  location: '📍',
  faction: '🛡',
  lore: '📖',
  timeline: '⏳',
  custom: '📄',
  item: '💎',
  pc_stub: '👤',
  player_character: '👤',
};

function buildTableHtml(cols: number, rows: number): string {
  const ths = Array.from({ length: cols }, (_, i) => `<th>Col ${i + 1}</th>`).join('');
  const tds = Array.from({ length: cols }, () => '<td>&nbsp;</td>').join('');
  const trs = Array.from({ length: rows - 1 }, () => `<tr>${tds}</tr>`).join('');
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

function insertTableHtmlAtBlock(blockId: string, cols: number, rows: number) {
  const el = document.querySelector(`[data-block-id="${blockId}"] .lore-block-content`) as HTMLElement | null;
  if (!el) return;
  el.focus();
  const sel = window.getSelection();
  if (sel && sel.rangeCount === 0) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.execCommand('insertHTML', false, buildTableHtml(cols, rows));
}

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];
const TEXT_COLORS = ['#ffffff', '#d3bbff', '#adc6ff', '#1D9E75', '#EF9F27', '#E24B4A', '#f472b6', '#e2e2e5'];
const HIGHLIGHT_COLORS = ['transparent', '#6d28d9', '#0566d9', '#1D9E75', '#EF9F27', '#E24B4A', '#713f12', '#334155'];

// ── BlockContent ────────────────────────────────────────────────────────

function BlockContent({ id, initialHtml, editable, onInput, onFocus, onBlur, onPaste, onImageResize, onImageDrag, onDeleteImage }: {
  id: string;
  initialHtml: string;
  editable: boolean;
  onInput: (id: string, html: string) => void;
  onFocus: (id: string) => void;
  onBlur: (id: string, el: HTMLElement, html: string) => void;
  onPaste: (id: string, e: React.ClipboardEvent) => void;
  onImageResize: (id: string, imgWidth: number) => void;
  onImageDrag: (id: string, img: HTMLImageElement, startX: number, startY: number) => void;
  onDeleteImage: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initialHtml);

  useEffect(() => {
    if (elRef.current && initialRef.current) {
      elRef.current.innerHTML = initialRef.current;
    }
  }, []);

  // Tab navigation in tables + Delete/Backspace on selected images + mentions
  useEffect(() => {
    if (!elRef.current || !editable) return;
    const el = elRef.current;

    function handleKeyDown(e: KeyboardEvent) {
      // Delete/Backspace on selected image
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selected = el.querySelector('img.lore-img-selected') as HTMLImageElement | null;
        if (selected) {
          e.preventDefault();
          const wrap = selected.closest('.lore-img-resize-wrap');
          if (wrap) wrap.remove(); else selected.remove();
          onInput(id, el.innerHTML);
          if (!blockHasContent(el)) onDeleteImage(id);
          return;
        }

        // Delete/Backspace on mention chips adjacent to the caret.
        // contentEditable=false elements can't be deleted natively in
        // all browsers. Walk the DOM to find the nearest mention.
        const mentionSel = window.getSelection();
        if (mentionSel && mentionSel.isCollapsed && mentionSel.rangeCount > 0) {
          const r = mentionSel.getRangeAt(0);
          const c = r.startContainer;
          const o = r.startOffset;
          const back = e.key === 'Backspace';

          function findMention(node: Node | null, direction: 'prev' | 'next'): HTMLElement | null {
            while (node) {
              if (node instanceof HTMLElement && node.classList?.contains('vaultstone-mention')) return node;
              if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').length > 0) return null;
              if (node instanceof HTMLElement && node.textContent && node.textContent.length > 0
                  && !node.classList?.contains('vaultstone-mention')) return null;
              node = direction === 'prev' ? node.previousSibling : node.nextSibling;
            }
            return null;
          }

          let chip: HTMLElement | null = null;

          if (c.nodeType === Node.ELEMENT_NODE) {
            // Caret between child nodes
            if (back && o > 0) chip = findMention((c as Element).childNodes[o - 1], 'prev');
            if (!back) chip = findMention((c as Element).childNodes[o] ?? null, 'next');
          }

          if (!chip && c.nodeType === Node.TEXT_NODE) {
            if (back && o === 0) {
              // Walk up through empty wrappers to find previous sibling
              let walk: Node | null = c;
              while (walk && walk !== el && !chip) {
                chip = findMention(walk.previousSibling, 'prev');
                if (chip) break;
                walk = walk.parentNode;
              }
            }
            if (!back && o === (c.textContent?.length ?? 0)) {
              let walk: Node | null = c;
              while (walk && walk !== el && !chip) {
                chip = findMention(walk.nextSibling, 'next');
                if (chip) break;
                walk = walk.parentNode;
              }
            }
          }

          if (chip && el.contains(chip)) {
            e.preventDefault();
            chip.remove();
            onInput(id, el.innerHTML);
            return;
          }
        }
      }

      // Tab in tables — walk all cells in the table regardless of thead/tbody
      if (e.key === 'Tab') {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        let node: Node | null = sel.anchorNode;
        let cell: HTMLElement | null = null;
        while (node && node !== el) {
          if (node instanceof HTMLElement && (node.tagName === 'TD' || node.tagName === 'TH')) {
            cell = node;
            break;
          }
          node = node.parentNode;
        }
        if (!cell) return;
        e.preventDefault();
        e.stopPropagation();

        const table = cell.closest('table');
        if (!table) return;
        const allCells = Array.from(table.querySelectorAll('th, td')) as HTMLElement[];
        const idx = allCells.indexOf(cell);

        let next: HTMLElement | null = null;
        if (e.shiftKey) {
          next = idx > 0 ? allCells[idx - 1] : null;
        } else {
          next = idx < allCells.length - 1 ? allCells[idx + 1] : null;
        }

        if (next) {
          const range = document.createRange();
          range.selectNodeContents(next);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [editable, id, onInput, onDeleteImage]);

  useEffect(() => {
    if (!elRef.current || !editable) return;
    const el = elRef.current;

    function clearImgUI() {
      el.querySelectorAll('.lore-img-selected').forEach((s) => s.classList.remove('lore-img-selected'));
      el.querySelectorAll('.lore-img-resize-wrap').forEach((w) => {
        const inner = w.querySelector('img');
        if (inner) w.parentElement?.replaceChild(inner, w);
      });
    }

    function addResizeHandle(wrapper: HTMLElement, img: HTMLImageElement, edge: string) {
      const h = document.createElement('div');
      h.className = `lore-img-handle lore-img-handle-${edge}`;
      wrapper.appendChild(h);

      h.addEventListener('mousedown', (me) => {
        me.preventDefault();
        me.stopPropagation();
        const startX = me.clientX;
        const startY = me.clientY;
        const startW = img.offsetWidth;
        const startH = img.offsetHeight;
        const ratio = img.naturalHeight / img.naturalWidth;
        img.style.maxWidth = 'none';

        function onMove(mv: MouseEvent) {
          const dx = mv.clientX - startX;
          const dy = mv.clientY - startY;
          let newW = startW;
          let newH = startH;

          if (edge === 'corner') {
            const delta = (Math.abs(dx) > Math.abs(dy)) ? dx : dy / ratio;
            newW = Math.max(30, startW + delta);
            newH = Math.round(newW * ratio);
          } else if (edge === 'right' || edge === 'left') {
            const sign = edge === 'left' ? -1 : 1;
            newW = Math.max(30, startW + dx * sign);
            newH = startH;
          } else if (edge === 'top' || edge === 'bottom') {
            const sign = edge === 'top' ? -1 : 1;
            newH = Math.max(30, startH + dy * sign);
            newW = startW;
          }

          img.style.width = `${Math.round(newW)}px`;
          img.style.height = `${Math.round(newH)}px`;
          onImageResize(id, Math.round(newW));
        }
        function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          clearImgUI();
          onInput(id, el.innerHTML);
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    function handleImgClick(e: MouseEvent) {
      const img = (e.target as HTMLElement).closest('img') as HTMLImageElement | null;
      if (!img) return;
      e.preventDefault();
      e.stopPropagation();

      const wasSelected = img.classList.contains('lore-img-selected');
      clearImgUI();
      if (wasSelected) {
        onInput(id, el.innerHTML);
        return;
      }

      img.classList.add('lore-img-selected');

      const wrapper = document.createElement('span');
      wrapper.className = 'lore-img-resize-wrap';
      wrapper.contentEditable = 'false';
      wrapper.style.display = 'inline-block';
      wrapper.style.position = 'relative';
      img.parentElement?.replaceChild(wrapper, img);
      wrapper.appendChild(img);

      for (const edge of ['corner', 'right', 'left', 'top', 'bottom']) {
        addResizeHandle(wrapper, img, edge);
      }

      // Drag image via the image itself (left-button only, with movement threshold)
      const dragImg = img;
      dragImg.addEventListener('mousedown', (me) => {
        if (me.button !== 0) return;
        if ((me.target as HTMLElement).closest('.lore-img-handle')) return;
        const sx = me.clientX, sy = me.clientY;
        function onMove(mv: MouseEvent) {
          if (Math.hypot(mv.clientX - sx, mv.clientY - sy) < 4) return;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          onImageDrag(id, dragImg, mv.clientX, mv.clientY);
        }
        function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        }
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    }

    el.addEventListener('click', handleImgClick);
    return () => el.removeEventListener('click', handleImgClick);
  }, [editable, id, onInput, onImageResize, onImageDrag]);

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
          onBlur(id, elRef.current, elRef.current.innerHTML);
        }
      }}
      onPaste={(e) => onPaste(id, e)}
    />
  );
}

// ── Table Size Picker ───────────────────────────────────────────────────

function TablePicker({ onSelect, onClose, anchorRect }: {
  onSelect: (cols: number, rows: number) => void;
  onClose: () => void;
  anchorRect: { left: number; bottom: number } | null;
}) {
  const MAX_COLS = 7;
  const MAX_ROWS = 6;
  const [hover, setHover] = useState<{ c: number; r: number } | null>(null);

  const posStyle = anchorRect
    ? { position: 'fixed' as const, top: anchorRect.bottom + 4, left: anchorRect.left, transform: 'none' }
    : { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="lore-table-picker-backdrop" onClick={onClose}>
      <div className="lore-table-picker" style={posStyle} onClick={(e) => e.stopPropagation()}>
        <div className="lore-table-picker-label">
          {hover ? `${hover.c} × ${hover.r}` : 'Select size'}
        </div>
        <div className="lore-table-picker-grid">
          {Array.from({ length: MAX_ROWS }, (_, r) => (
            <div key={r} style={{ display: 'flex', gap: 2 }}>
              {Array.from({ length: MAX_COLS }, (_, c) => {
                const active = hover && c < hover.c && r < hover.r;
                return (
                  <div
                    key={c}
                    className={`lore-table-picker-cell ${active ? 'active' : ''}`}
                    onMouseEnter={() => setHover({ c: c + 1, r: r + 1 })}
                    onClick={() => onSelect(c + 1, r + 1)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Mention Typeahead ────────────────────────────────────────────────────

function MentionTypeahead({ query, pages, position, onSelect, onClose, getSectionLabel }: {
  query: string;
  pages: MentionablePage[];
  position: { x: number; y: number };
  onSelect: (page: MentionablePage) => void;
  onClose: () => void;
  getSectionLabel?: (id: string) => string;
}) {
  const q = query.toLowerCase();
  const filtered = pages.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 8);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => setActiveIdx(0), [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[activeIdx]) onSelect(filtered[activeIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [filtered, activeIdx, onSelect, onClose]);

  if (filtered.length === 0) {
    return (
      <div className="lore-mention-popup" style={{ left: position.x, top: position.y }}>
        <div className="lore-mention-empty">No matches</div>
      </div>
    );
  }

  return (
    <div className="lore-mention-popup" style={{ left: position.x, top: position.y }}>
      <div className="lore-mention-list">
        {filtered.map((p, i) => (
          <button
            key={p.id}
            className={`lore-mention-item ${i === activeIdx ? 'active' : ''}`}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); onSelect(p); }}
            onMouseEnter={() => setActiveIdx(i)}
          >
            <span className="lore-mention-item-icon">{MENTION_KIND_ICON[p.page_kind] ?? '📄'}</span>
            <span className="lore-mention-item-text">
              <span className="lore-mention-item-title">{p.title}</span>
              {getSectionLabel ? (
                <span className="lore-mention-item-meta">{getSectionLabel(p.section_id)}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main Editor ─────────────────────────────────────────────────────────

export function LoreCanvasEditor({ initialBlocks, onChange, editable = true, mentionablePages, getSectionLabel, onMentionClick, worldId, pageId }: Props) {
  const { isMobile } = useBreakpoint();
  const [blocks, setBlocks] = useState<CanvasBlock[]>(initialBlocks ?? []);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Right-click menu on world-image elements — caption editor +
  // pin actions for DM'd campaigns. Mode flips between the root
  // option list, the inline caption editor, and the campaign
  // chooser when multiple campaigns DM'd by the user are linked
  // to this world.
  const [imageMenu, setImageMenu] = useState<{
    imageId: string;
    x: number;
    y: number;
    mode: 'root' | 'caption' | 'pin-scene' | 'pin-subject';
  } | null>(null);
  const [imageMenuDraftCaption, setImageMenuDraftCaption] = useState('');
  const [imageMenuSaving, setImageMenuSaving] = useState(false);
  const [imageMenuDMCampaigns, setImageMenuDMCampaigns] = useState<
    Array<{ id: string; name: string }> | null
  >(null);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  // Pending pin — populated when an image's aspect doesn't match
  // the target slot, so the user has to crop before we can commit
  // the pin. The ImageCropModal mounts on this state and clears it
  // on confirm/cancel.
  const [pendingPin, setPendingPin] = useState<{
    campaignId: string;
    sourceImageId: string;
    sourceWidth: number;
    sourceHeight: number;
    slot: PinSlot;
    aspect: [number, number];
    signedUrl: string;
  } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const changeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlRef = useRef<Record<string, string>>({});
  const [tablePicker, setTablePicker] = useState(false);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const [textColorOpen, setTextColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const tableButtonRef = useRef<HTMLButtonElement>(null);
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());
  const savedSelRef = useRef<Range | null>(null);
  const [mentionState, setMentionState] = useState<{
    blockId: string;
    query: string;
    position: { x: number; y: number };
    startOffset: number;
    node: Node;
  } | null>(null);

  for (const b of blocks) {
    if (!(b.id in htmlRef.current)) htmlRef.current[b.id] = b.html;
  }

  // Load the list of campaigns the auth'd user DMs that are linked
  // to this world. Cached on the component since the menu is the
  // only consumer; re-fetched once per world. A user not DM'ing
  // any linked campaign sees pin actions disabled with a hint.
  useEffect(() => {
    if (!worldId || !userId) {
      setImageMenuDMCampaigns([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await getCampaignsForWorld(worldId);
      if (cancelled) return;
      const rows = (data ?? []) as unknown as Array<{
        campaigns: { id: string; name: string; dm_user_id: string } | null;
      }>;
      const entries = rows
        .map((r) => r.campaigns)
        .filter((c): c is { id: string; name: string; dm_user_id: string } =>
          !!c && c.dm_user_id === userId)
        .map((c) => ({ id: c.id, name: c.name }));
      setImageMenuDMCampaigns(entries);
    })();
    return () => { cancelled = true; };
  }, [worldId, userId]);

  // Close the image menu when the user clicks anywhere outside it.
  useEffect(() => {
    if (!imageMenu) return;
    function onAway(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest?.('.lore-image-menu')) return;
      setImageMenu(null);
    }
    window.addEventListener('mousedown', onAway);
    return () => window.removeEventListener('mousedown', onAway);
  }, [imageMenu]);

  // Refresh signed URLs on every `<img data-world-image-id>` after
  // the canvas mounts. Signed URLs from storage have a ~1h TTL, so
  // serialized HTML carries stale URLs across page reloads. The
  // helper caches per-id, so this loop is one quick round-trip per
  // distinct image and a no-op on later renders within the cache
  // window.
  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    const imgs = canvasRef.current.querySelectorAll<HTMLImageElement>('img[data-world-image-id]');
    if (imgs.length === 0) return;

    const seen = new Set<string>();
    imgs.forEach((img) => {
      const imageId = img.getAttribute('data-world-image-id');
      if (!imageId || seen.has(imageId)) return;
      seen.add(imageId);
      void getWorldImageSignedUrlById(imageId).then(({ data }) => {
        if (cancelled || !data?.signedUrl) return;
        // Update every <img> in the canvas with this id (a single
        // image can appear inside multiple blocks if duplicated).
        canvasRef.current?.querySelectorAll<HTMLImageElement>(
          `img[data-world-image-id="${imageId}"]`,
        ).forEach((node) => {
          node.src = data.signedUrl;
        });
      });
    });
    return () => { cancelled = true; };
    // Re-run when blocks change so newly inserted images get their
    // signed-URL resolution too. The helper's per-id cache makes
    // this cheap.
  }, [blocks]);

  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    function measure() {
      let maxBottom = 0;
      for (const b of blocksRef.current) {
        const blockEl = document.querySelector(`[data-block-id="${b.id}"]`) as HTMLElement | null;
        const h = blockEl?.offsetHeight ?? 80;
        maxBottom = Math.max(maxBottom, b.y + h);
      }
      setContentHeight(maxBottom + 120);
    }
    measure();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(measure);
    canvas.querySelectorAll('.lore-block').forEach((el) => ro.observe(el));
    const mo = new MutationObserver(() => {
      ro.disconnect();
      canvas.querySelectorAll('.lore-block').forEach((el) => ro.observe(el));
      measure();
    });
    mo.observe(canvas, { childList: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [blocks]);

  useEffect(() => {
    if (!editable) return;
    const CMDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'];
    function poll() {
      const next = new Set<string>();
      for (const cmd of CMDS) {
        try { if (document.queryCommandState(cmd)) next.add(cmd); } catch { /* ignore */ }
      }
      setActiveFormats((prev) => {
        if (prev.size !== next.size) return next;
        for (const v of next) { if (!prev.has(v)) return next; }
        return prev;
      });
    }
    document.addEventListener('selectionchange', poll);
    return () => document.removeEventListener('selectionchange', poll);
  }, [editable]);

  // Mark mention chips pointing at deleted pages + refresh stale labels.
  useEffect(() => {
    if (!canvasRef.current) return;
    const pageById = new Map((mentionablePages ?? []).map((p) => [p.id, p]));
    canvasRef.current.querySelectorAll<HTMLElement>('.vaultstone-mention[data-id]').forEach((chip) => {
      const kind = chip.getAttribute('data-kind') ?? 'page';
      if (kind !== 'page') return;
      const id = chip.getAttribute('data-id')!;
      const ref = pageById.get(id);
      chip.classList.toggle('vaultstone-mention--deleted', !ref);
      if (ref) {
        const expected = `@ ${ref.title}`;
        if (chip.textContent !== expected) {
          chip.textContent = expected;
        }
      }
    });
  }, [mentionablePages, blocks]);

  function buildSnapshot(base?: CanvasBlock[]): CanvasBlock[] {
    return (base ?? blocksRef.current).map((b) => ({
      ...b,
      html: htmlRef.current[b.id] ?? b.html,
    }));
  }

  function flushPendingSave() {
    if (changeTimerRef.current) {
      clearTimeout(changeTimerRef.current);
      changeTimerRef.current = null;
      const final = buildSnapshot();
      onChangeRef.current(final, blocksToPlainText(final), extractRefsFromBlocks(final));
    }
  }

  function emitChange(next?: CanvasBlock[]) {
    if (changeTimerRef.current) clearTimeout(changeTimerRef.current);
    changeTimerRef.current = setTimeout(() => {
      const final = buildSnapshot(next);
      onChangeRef.current(final, blocksToPlainText(final), extractRefsFromBlocks(final));
    }, 800);
  }

  function materializePending(): string | null {
    if (!pendingClick) return null;
    const { x, y } = pendingClick;
    setPendingClick(null);
    const id = uid();
    const newBlock: CanvasBlock = { id, x, y, width: 320, html: '' };
    htmlRef.current[id] = '';
    setBlocks((prev) => [...prev, newBlock]);
    setFocusedId(id);
    return id;
  }

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable) return;
    const target = e.target as HTMLElement;
    if (target !== canvasRef.current) return;

    const rect = canvasRef.current!.getBoundingClientRect();
    const x = snap(Math.max(0, e.clientX - rect.left - 32));
    const y = snap(Math.max(0, e.clientY - rect.top - 12));

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setPendingClick({ x, y });
    setFocusedId(null);
  }, [editable]);

  const handleCanvasContextMenu = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable) return;
    const target = e.target as HTMLElement;

    // Right-click on a tagged world image → open the pin/caption
    // menu instead of the browser default. Walks up to find an
    // <img data-world-image-id> ancestor since the click can land
    // on an inner wrapper or resize handle. Falls through to the
    // existing canvas-blank paste behavior on non-image clicks.
    const imgEl = target.closest?.('img[data-world-image-id]') as HTMLImageElement | null;
    if (imgEl) {
      const imageId = imgEl.getAttribute('data-world-image-id');
      if (imageId) {
        e.preventDefault();
        const rect = canvasRef.current!.getBoundingClientRect();
        setImageMenu({
          imageId,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          mode: 'root',
        });
      }
      return;
    }

    if (target !== canvasRef.current) return;

    e.preventDefault();
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = snap(Math.max(0, e.clientX - rect.left - 32));
      const y = snap(Math.max(0, e.clientY - rect.top - 12));
      const newId = uid();
      const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      htmlRef.current[newId] = html;
      setBlocks((prev) => [...prev, { id: newId, x, y, width: 320, html }]);
      setFocusedId(newId);
      setPendingClick(null);
      emitChange();
    } catch { /* clipboard permission denied — let browser default */ }
  }, [editable]);

  const BLOCK_PADDING = 28 + 12 + 2 + 12;

  function fitBlockToContent(id: string) {
    const blockEl = document.querySelector(`[data-block-id="${id}"]`) as HTMLElement | null;
    if (!blockEl) return;
    const content = blockEl.querySelector('.lore-block-content') as HTMLElement | null;
    if (!content) return;
    const imgs = content.querySelectorAll('img');
    if (imgs.length === 0) return;
    let maxImgW = 0;
    imgs.forEach((img) => { maxImgW = Math.max(maxImgW, img.offsetWidth); });
    const needed = maxImgW + BLOCK_PADDING;
    setBlocks((prev) => prev.map((b) => b.id === id ? { ...b, width: Math.max(b.width, needed) } : b));
  }

  function handleImageResize(id: string, imgWidth: number) {
    const needed = imgWidth + BLOCK_PADDING;
    setBlocks((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      return { ...b, width: Math.max(120, needed) };
    }));
  }

  const handleImageDrag = useCallback((blockId: string, img: HTMLImageElement, startClientX: number, startClientY: number) => {
    if (!canvasRef.current) return;
    const imgW = img.offsetWidth;
    const imgH = img.offsetHeight;
    const imgSrc = img.src;
    const imgStyle = img.getAttribute('style') ?? '';

    const cr = canvasRef.current.getBoundingClientRect();
    const startX = startClientX - cr.left;
    const startY = startClientY - cr.top;

    const ghost = document.createElement('img');
    ghost.src = imgSrc;
    ghost.className = 'lore-img-drag-ghost';
    ghost.style.width = `${imgW}px`;
    ghost.style.height = `${imgH}px`;
    ghost.style.left = `${startX - imgW / 2}px`;
    ghost.style.top = `${startY - imgH / 2}px`;
    canvasRef.current.appendChild(ghost);

    function onMove(mv: MouseEvent) {
      if (!canvasRef.current) return;
      const r = canvasRef.current.getBoundingClientRect();
      ghost.style.left = `${mv.clientX - r.left - imgW / 2}px`;
      ghost.style.top = `${mv.clientY - r.top - imgH / 2}px`;
    }

    function onUp(ev: MouseEvent) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      ghost.remove();

      if (!canvasRef.current) return;
      const r = canvasRef.current.getBoundingClientRect();
      const dropX = snap(Math.max(0, ev.clientX - r.left - imgW / 2));
      const dropY = snap(Math.max(0, ev.clientY - r.top - imgH / 2));

      // Remove image from source block
      const srcEl = document.querySelector(`[data-block-id="${blockId}"] .lore-block-content`) as HTMLElement | null;
      if (srcEl) {
        img.remove();
        htmlRef.current[blockId] = srcEl.innerHTML;
        if (!blockHasContent(srcEl)) {
          delete htmlRef.current[blockId];
          setBlocks((prev) => prev.filter((b) => b.id !== blockId));
        }
      }

      // Create new block with the image
      const newId = uid();
      const imgTag = `<img src="${imgSrc}" style="${imgStyle}" />`;
      htmlRef.current[newId] = imgTag;
      setBlocks((prev) => [...prev, { id: newId, x: dropX, y: dropY, width: imgW + BLOCK_PADDING, html: imgTag }]);
      emitChange();
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [BLOCK_PADDING]);

  function resolveTextNode(range: Range): { node: Text; cursor: number } | null {
    let node: Node = range.startContainer;
    const cursor = range.startOffset;
    if (node.nodeType === Node.TEXT_NODE) return { node: node as Text, cursor };
    // Cursor is in an element node — Chrome wraps new text after
    // contentEditable=false spans in auto-generated elements.
    const child = node.childNodes[cursor] ?? node.childNodes[cursor - 1];
    if (child?.nodeType === Node.TEXT_NODE) {
      return { node: child as Text, cursor: node.childNodes[cursor] === child ? 0 : (child.textContent ?? '').length };
    }
    if (child) {
      const walk = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
      const last = walk.lastChild();
      if (last) return { node: last as Text, cursor: (last.textContent ?? '').length };
    }
    return null;
  }

  function handleBlockInput(id: string, html: string) {
    htmlRef.current[id] = html;
    requestAnimationFrame(() => fitBlockToContent(id));
    emitChange();

    // Detect @ mention trigger
    if (mentionablePages && mentionablePages.length > 0) {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const resolved = resolveTextNode(sel.getRangeAt(0));
      if (!resolved) { setMentionState(null); return; }
      const { node, cursor } = resolved;
      const text = node.textContent ?? '';
      const atIdx = text.lastIndexOf('@', cursor - 1);
      if (atIdx < 0 || (atIdx > 0 && text[atIdx - 1] !== ' ' && text[atIdx - 1] !== '\n')) {
        setMentionState(null);
        return;
      }
      const query = text.slice(atIdx + 1, cursor);
      if (query.includes(' ') && query.length > 20) { setMentionState(null); return; }

      const r = document.createRange();
      r.setStart(node, atIdx);
      r.setEnd(node, atIdx);
      const rect = r.getBoundingClientRect();
      setMentionState({
        blockId: id,
        query,
        position: { x: rect.left, y: rect.bottom + 4 },
        startOffset: atIdx,
        node,
      });
    }
  }

  function handleMentionSelect(page: MentionablePage) {
    if (!mentionState) return;
    const { blockId, startOffset, node } = mentionState;
    setMentionState(null);

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const el = document.querySelector(`[data-block-id="${blockId}"] .lore-block-content`) as HTMLElement | null;
    if (!el) return;

    const curRange = sel.getRangeAt(0);
    const resolved = resolveTextNode(curRange);
    const text = node.textContent ?? '';
    const cursor = resolved && resolved.node === node ? resolved.cursor : text.length;
    const before = text.slice(0, startOffset);
    const after = text.slice(cursor);

    const chip = document.createElement('span');
    chip.className = 'vaultstone-mention';
    chip.setAttribute('data-id', page.id);
    chip.setAttribute('data-kind', 'page');
    chip.contentEditable = 'false';
    chip.textContent = `@ ${page.title}`;

    const trailing = document.createTextNode(after || ' ');

    // Split the text node and insert chip + trailing text in place.
    // Keep everything within the same parent to avoid displacing text
    // when the node is nested inside browser-generated wrapper spans.
    node.textContent = before;
    const mParent = node.parentNode!;
    const mRef = node.nextSibling;
    mParent.insertBefore(chip, mRef);
    mParent.insertBefore(trailing, chip.nextSibling);
    // Capture the chip HTML immediately — don't defer to rAF because a blur
    // event (triggered by clicking the typeahead popup) may have already
    // captured stale HTML without the chip.
    htmlRef.current[blockId] = el.innerHTML;

    // Place cursor at the start of the trailing text node
    requestAnimationFrame(() => {
      const r = document.createRange();
      r.setStart(trailing, after ? 0 : 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
      el.focus();
      // Update htmlRef again in case the DOM settled differently after rAF
      htmlRef.current[blockId] = el.innerHTML;
    });

    // Fire onChange immediately (no debounce) so the chip is persisted
    // before any navigation can race it.
    if (changeTimerRef.current) {
      clearTimeout(changeTimerRef.current);
      changeTimerRef.current = null;
    }
    const final = buildSnapshot();
    onChangeRef.current(final, blocksToPlainText(final), extractRefsFromBlocks(final));
  }

  function handleBlockBlur(id: string, el: HTMLElement, html: string) {
    if (!blockHasContent(el)) {
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

  /**
   * Upload a pasted/dropped image to Supabase storage as a real
   * `world_images` record, then render it as an `<img>` carrying
   * `data-world-image-id` so right-click pin actions can resolve
   * back to the row. Returns the rendered HTML tag (or null if the
   * upload fails) along with the image's natural dimensions for
   * block sizing. When the editor lacks a worldId/pageId context
   * (preview, legacy embeds), the caller falls back to the
   * data-URL path that pre-existed this refactor.
   */
  async function uploadCanvasImage(file: File): Promise<{
    html: string;
    width: number;
    height: number;
  } | null> {
    if (!worldId || !pageId) return null;

    // Probe natural dimensions client-side first so we have an
    // accurate display size + can persist them on the
    // world_images row (the row stores the original dimensions
    // the way BodyEditor's WorldImageNode does).
    const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = reader.result as string;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!dims) return null;

    const imageId = crypto.randomUUID();
    const filename = file.name && file.name.length > 0 ? file.name : 'image';
    const { key, error: uploadErr } = await uploadWorldImage({
      worldId,
      imageId,
      filename,
      body: file,
      contentType: file.type || 'image/jpeg',
    });
    if (uploadErr) return null;

    const { error: rowErr } = await createWorldImage({
      id: imageId,
      world_id: worldId,
      page_id: pageId,
      image_key: key,
      width: dims.w,
      height: dims.h,
      byte_size: file.size,
      content_type: file.type || 'image/jpeg',
    });
    if (rowErr) return null;

    const { data: signed } = await getWorldImageSignedUrlById(imageId);
    const src = signed?.signedUrl;
    if (!src) return null;

    // Cap visible width at 480 to match the legacy data-URL path
    // (so existing canvas layouts don't shift dramatically when
    // the new path lands). Height tracks the natural aspect ratio.
    const maxW = 480;
    const w = Math.min(dims.w, maxW);
    const h = Math.round(w * (dims.h / dims.w));
    // data-world-image-caption starts empty; the right-click
    // editor sets it on the rendered <img> after the user types
    // and saves. The DB row is the source of truth — this attr
    // is just a render-time mirror so re-opening the menu doesn't
    // require a fresh DB hit.
    const html = `<img data-world-image-id="${imageId}" data-world-image-caption="" src="${src}" style="width:${w}px;height:${h}px;border-radius:6px;display:block;margin:4px 0;" />`;
    return { html, width: w, height: h };
  }

  function handleBlockPaste(id: string, e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;

        // Upload-routed path: world_images row + signed URL. Falls
        // back to the legacy data-URL insert when worldId/pageId
        // aren't in scope (preview, legacy embeds).
        void (async () => {
          const uploaded = await uploadCanvasImage(file);
          if (uploaded) {
            document.execCommand('insertHTML', false, uploaded.html);
            const el = document.querySelector(`[data-block-id="${id}"] .lore-block-content`) as HTMLElement;
            if (el) {
              htmlRef.current[id] = el.innerHTML;
              requestAnimationFrame(() => fitBlockToContent(id));
              emitChange();
            }
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const img = new Image();
            img.onload = () => {
              const maxW = 480;
              const w = Math.min(img.naturalWidth, maxW);
              const h = Math.round(w * (img.naturalHeight / img.naturalWidth));
              document.execCommand(
                'insertHTML',
                false,
                `<img src="${dataUrl}" style="width:${w}px;height:${h}px;border-radius:6px;display:block;margin:4px 0;" />`,
              );
              const el = document.querySelector(`[data-block-id="${id}"] .lore-block-content`) as HTMLElement;
              if (el) {
                htmlRef.current[id] = el.innerHTML;
                requestAnimationFrame(() => fitBlockToContent(id));
                emitChange();
              }
            };
            img.src = dataUrl;
          };
          reader.readAsDataURL(file);
        })();
        return;
      }
    }
  }

  // Canvas-level paste: create a block from pasted content when no block is focused
  useEffect(() => {
    if (!editable) return;
    function onPaste(e: ClipboardEvent) {
      if (focusedId) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;

          // Same upload-routed-with-fallback pattern as
          // handleBlockPaste — try the world_images path first
          // and fall back to the legacy data-URL insert when the
          // editor lacks a worldId/pageId context.
          void (async () => {
            const uploaded = await uploadCanvasImage(file);
            if (uploaded) {
              const pos = pendingClick ?? { x: snap(40), y: snap(40) };
              setPendingClick(null);
              const newId = uid();
              htmlRef.current[newId] = uploaded.html;
              setBlocks((prev) => [...prev, {
                id: newId, x: pos.x, y: pos.y,
                width: uploaded.width + BLOCK_PADDING,
                html: uploaded.html,
              }]);
              setFocusedId(newId);
              emitChange();
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const img = new Image();
              img.onload = () => {
                const maxW = 480;
                const w = Math.min(img.naturalWidth, maxW);
                const h = Math.round(w * (img.naturalHeight / img.naturalWidth));
                const pos = pendingClick ?? { x: snap(40), y: snap(40) };
                setPendingClick(null);
                const newId = uid();
                const imgTag = `<img src="${dataUrl}" style="width:${w}px;height:${h}px;border-radius:6px;display:block;margin:4px 0;" />`;
                htmlRef.current[newId] = imgTag;
                setBlocks((prev) => [...prev, { id: newId, x: pos.x, y: pos.y, width: w + BLOCK_PADDING, html: imgTag }]);
                setFocusedId(newId);
                emitChange();
              };
              img.src = dataUrl;
            };
            reader.readAsDataURL(file);
          })();
          return;
        }
      }

      const text = e.clipboardData?.getData('text/html') || e.clipboardData?.getData('text/plain');
      if (text) {
        e.preventDefault();
        const pos = pendingClick ?? { x: snap(40), y: snap(40) };
        setPendingClick(null);
        const newId = uid();
        const html = e.clipboardData?.getData('text/html') || text.replace(/\n/g, '<br>');
        htmlRef.current[newId] = html;
        setBlocks((prev) => [...prev, { id: newId, x: pos.x, y: pos.y, width: 320, html }]);
        setFocusedId(newId);
        emitChange();
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Materialize pending block on keypress
  useEffect(() => {
    if (!pendingClick || !editable) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setPendingClick(null); return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const newId = materializePending();
        if (newId) {
          requestAnimationFrame(() => {
            const el = document.querySelector(`[data-block-id="${newId}"] .lore-block-content`) as HTMLElement;
            if (el) {
              el.focus();
              document.execCommand('insertText', false, e.key);
            }
          });
        }
        e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
      const nx = snap(Math.max(0, ev.clientX - cr.left - dragOffset.current.x));
      const ny = snap(Math.max(0, ev.clientY - cr.top - dragOffset.current.y));
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

  function handleResizeStart(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const block = blocksRef.current.find((b) => b.id === id);
    if (!block) return;

    const startX = e.clientX;
    const startW = block.width;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      setBlocks((prev) => prev.map((b) => {
        if (b.id !== id) return b;
        return { ...b, width: snap(Math.max(120, startW + dx)) };
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

  function execCmd(cmd: string, arg?: string) {
    if (cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.anchorNode;
        const targetTag = cmd === 'insertUnorderedList' ? 'UL' : 'OL';
        const otherTag = cmd === 'insertUnorderedList' ? 'OL' : 'UL';
        let existingList: HTMLElement | null = null;
        while (node && !(node instanceof HTMLElement && node.classList?.contains('lore-block-content'))) {
          if (node instanceof HTMLElement && (node.tagName === 'UL' || node.tagName === 'OL')) {
            existingList = node;
          }
          node = node.parentNode;
        }
        if (existingList) {
          if (existingList.tagName === targetTag) {
            // Already in same list type — unwrap: replace list items with plain paragraphs
            const parent = existingList.parentNode!;
            const items = Array.from(existingList.querySelectorAll(':scope > li'));
            for (const li of items) {
              const p = document.createElement('p');
              p.innerHTML = li.innerHTML;
              parent.insertBefore(p, existingList);
            }
            parent.removeChild(existingList);
          } else if (existingList.tagName === otherTag) {
            // In other list type — switch: just change the tag
            const replacement = document.createElement(targetTag.toLowerCase());
            replacement.innerHTML = existingList.innerHTML;
            existingList.parentNode!.replaceChild(replacement, existingList);
          }
          return;
        }
      }
    }
    document.execCommand(cmd, false, arg);
  }

  useEffect(() => {
    if (!editable) return;
    const SHORTCUTS: Record<string, string> = {
      b: 'bold', i: 'italic', u: 'underline',
      s: 'strikeThrough', '.': 'insertUnorderedList', '/': 'insertOrderedList',
    };
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const cmd = SHORTCUTS[e.key.toLowerCase()];
      if (cmd) {
        e.preventDefault();
        e.stopPropagation();
        execCmd(cmd);
        if (focusedId) {
          const el = document.querySelector(`[data-block-id="${focusedId}"] .lore-block-content`) as HTMLElement;
          if (el) { htmlRef.current[focusedId] = el.innerHTML; emitChange(); }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [editable, focusedId]);

  function handleTableInsert(cols: number, rows: number) {
    setTablePicker(false);
    if (focusedId) {
      insertTableHtmlAtBlock(focusedId, cols, rows);
      const el = document.querySelector(`[data-block-id="${focusedId}"] .lore-block-content`) as HTMLElement | null;
      if (el) {
        htmlRef.current[focusedId] = el.innerHTML;
        emitChange();
      }
    } else {
      const pos = pendingClick ?? { x: snap(40), y: snap(40) };
      setPendingClick(null);
      const id = uid();
      const html = buildTableHtml(cols, rows);
      htmlRef.current[id] = html;
      setBlocks((prev) => [...prev, { id, x: pos.x, y: pos.y, width: Math.max(320, cols * 100 + BLOCK_PADDING), html }]);
      setFocusedId(id);
      emitChange();
    }
  }

  const pd = (e: React.MouseEvent) => e.preventDefault();

  // ── Image menu handlers ────────────────────────────────────────────
  function openImageCaptionEditor() {
    if (!imageMenu) return;
    // Read the current caption from any matching <img> in the
    // canvas (re-renders mirror it across duplicates) so the
    // editor doesn't start blank when the user has a caption set.
    const current = canvasRef.current
      ?.querySelector(`img[data-world-image-id="${imageMenu.imageId}"]`)
      ?.getAttribute('data-world-image-caption') ?? '';
    setImageMenuDraftCaption(current);
    setImageMenu({ ...imageMenu, mode: 'caption' });
  }

  async function commitImageCaption() {
    if (!imageMenu || imageMenuSaving) return;
    setImageMenuSaving(true);
    const { error } = await updateWorldImageCaption(
      imageMenu.imageId,
      imageMenuDraftCaption,
    );
    setImageMenuSaving(false);
    if (error) return;
    // Mirror the caption onto the rendered <img> so subsequent
    // re-opens of the menu show the new value without a refetch.
    canvasRef.current?.querySelectorAll<HTMLImageElement>(
      `img[data-world-image-id="${imageMenu.imageId}"]`,
    ).forEach((node) => node.setAttribute('data-world-image-caption', imageMenuDraftCaption));
    setImageMenu(null);
  }

  function chooseImageScene() {
    if (!imageMenu || !imageMenuDMCampaigns) return;
    if (imageMenuDMCampaigns.length === 0) return;
    if (imageMenuDMCampaigns.length === 1) {
      void pinImageSlot('scene', imageMenuDMCampaigns[0]!.id);
      return;
    }
    setImageMenu({ ...imageMenu, mode: 'pin-scene' });
  }
  function chooseImageSubject() {
    if (!imageMenu || !imageMenuDMCampaigns) return;
    if (imageMenuDMCampaigns.length === 0) return;
    if (imageMenuDMCampaigns.length === 1) {
      void pinImageSlot('subject', imageMenuDMCampaigns[0]!.id);
      return;
    }
    setImageMenu({ ...imageMenu, mode: 'pin-subject' });
  }

  async function pinImageSlot(slot: PinSlot, campaignId: string) {
    if (!imageMenu || !worldId) return;
    setImageMenuSaving(true);

    // Look up the source image's natural dimensions from the
    // rendered <img> in the canvas. The Tiptap node-view path
    // stores width/height on the node attrs; we don't have those
    // here so we fall back to the live <img> element.
    const imgEl = canvasRef.current?.querySelector<HTMLImageElement>(
      `img[data-world-image-id="${imageMenu.imageId}"]`,
    );
    const sourceWidth = imgEl?.naturalWidth ?? 0;
    const sourceHeight = imgEl?.naturalHeight ?? 0;

    const decision = await decidePinFlow({
      imageId: imageMenu.imageId,
      slot,
    });
    setImageMenuSaving(false);
    setImageMenu(null);
    if (!decision) return;

    // Hand off to the crop modal. The user always confirms
    // framing — even when the source aspect matches the slot,
    // they may want to focus on a particular subject within
    // the frame.
    setPendingPin({
      campaignId,
      sourceImageId: imageMenu.imageId,
      sourceWidth,
      sourceHeight,
      slot,
      aspect: decision.aspect,
      signedUrl: decision.signedUrl,
    });
  }

  async function handlePinCropConfirm(croppedBlobUri: string) {
    if (!pendingPin || !worldId) return;
    await commitPin({
      campaignId: pendingPin.campaignId,
      worldId,
      slot: pendingPin.slot,
      sourceImageId: pendingPin.sourceImageId,
      sourceWidth: pendingPin.sourceWidth,
      sourceHeight: pendingPin.sourceHeight,
      aspect: pendingPin.aspect,
      croppedBlobUri,
    });
    setPendingPin(null);
  }

  const canPin = !!worldId && !!userId
    && imageMenuDMCampaigns !== null
    && imageMenuDMCampaigns.length > 0;

  return (
    <View style={styles.root}>
      <CanvasStyles />
      {editable && isMobile && focusedId ? (
        <div className="lore-toolbar lore-toolbar-mobile">
          <button className={`lore-toolbar-btn${activeFormats.has('bold') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('bold')} type="button">
            <Icon name="format-bold" size={18} color={activeFormats.has('bold') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('italic') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('italic')} type="button">
            <Icon name="format-italic" size={18} color={activeFormats.has('italic') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('underline') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('underline')} type="button">
            <Icon name="format-underlined" size={18} color={activeFormats.has('underline') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <div className="lore-toolbar-sep" />
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('formatBlock', 'h2')} type="button">
            <Icon name="title" size={18} color={colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('insertUnorderedList') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('insertUnorderedList')} type="button">
            <Icon name="format-list-bulleted" size={18} color={activeFormats.has('insertUnorderedList') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('insertOrderedList') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('insertOrderedList')} type="button">
            <Icon name="format-list-numbered" size={18} color={activeFormats.has('insertOrderedList') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <div className="lore-toolbar-sep" />
          <button className={`lore-toolbar-btn${activeFormats.has('strikeThrough') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('strikeThrough')} type="button">
            <Icon name="strikethrough-s" size={18} color={activeFormats.has('strikeThrough') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('removeFormat')} type="button">
            <Icon name="format-clear" size={18} color={colors.onSurfaceVariant} />
          </button>
        </div>
      ) : null}

      {editable && !isMobile ? (
        <div className="lore-toolbar">
          {/* Font size */}
          <div style={{ position: 'relative' }}>
            <button className="lore-toolbar-btn lore-toolbar-btn-wide" onMouseDown={pd}
              onClick={() => { setFontSizeOpen(!fontSizeOpen); setTextColorOpen(false); setHighlightOpen(false); }}
              data-tooltip="Font size" type="button">
              <span className="lore-toolbar-label">Size</span>
              <Icon name="expand-more" size={12} color={colors.outline} />
            </button>
            {fontSizeOpen ? (
              <div className="lore-toolbar-dropdown"
                onMouseLeave={() => {
                  // Restore original on leave
                  document.querySelectorAll('[data-font-preview]').forEach((el) => {
                    const orig = (el as HTMLElement).getAttribute('data-font-preview');
                    if (orig) (el as HTMLElement).style.fontSize = orig;
                    (el as HTMLElement).removeAttribute('data-font-preview');
                  });
                }}
              >
                {FONT_SIZES.map((s) => (
                  <button key={s} className="lore-toolbar-dropdown-item" type="button"
                    onMouseDown={pd}
                    onMouseEnter={() => {
                      // Save selection and apply preview
                      const sel = window.getSelection();
                      if (sel && sel.rangeCount > 0) {
                        savedSelRef.current = sel.getRangeAt(0).cloneRange();
                      }
                      if (savedSelRef.current) {
                        const sel2 = window.getSelection();
                        sel2?.removeAllRanges();
                        sel2?.addRange(savedSelRef.current.cloneRange());
                        execCmd('fontSize', '7');
                        document.querySelectorAll('font[size="7"]').forEach((el) => {
                          const prev = (el as HTMLElement).getAttribute('data-font-preview') ?? ((el as HTMLElement).style.fontSize || '15px');
                          (el as HTMLElement).setAttribute('data-font-preview', prev);
                          (el as HTMLElement).removeAttribute('size');
                          (el as HTMLElement).style.fontSize = `${s}px`;
                        });
                      }
                    }}
                    onClick={() => {
                      // Commit: remove preview attrs
                      document.querySelectorAll('[data-font-preview]').forEach((el) => {
                        (el as HTMLElement).removeAttribute('data-font-preview');
                      });
                      savedSelRef.current = null;
                      setFontSizeOpen(false);
                      if (focusedId) {
                        const blockEl = document.querySelector(`[data-block-id="${focusedId}"] .lore-block-content`) as HTMLElement;
                        if (blockEl) { htmlRef.current[focusedId] = blockEl.innerHTML; emitChange(); }
                      }
                    }}>
                    {s}px
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="lore-toolbar-sep" />

          <button className={`lore-toolbar-btn${activeFormats.has('bold') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('bold')} data-tooltip="Bold (Ctrl+B)" data-tooltip-desc="Make your text bold." type="button">
            <Icon name="format-bold" size={18} color={activeFormats.has('bold') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('italic') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('italic')} data-tooltip="Italic (Ctrl+I)" data-tooltip-desc="Italicize your text." type="button">
            <Icon name="format-italic" size={18} color={activeFormats.has('italic') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('underline') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('underline')} data-tooltip="Underline (Ctrl+U)" data-tooltip-desc="Underline your text." type="button">
            <Icon name="format-underlined" size={18} color={activeFormats.has('underline') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('strikeThrough') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('strikeThrough')} data-tooltip="Strikethrough (Ctrl+S)" data-tooltip-desc="Cross out your text." type="button">
            <Icon name="strikethrough-s" size={18} color={activeFormats.has('strikeThrough') ? colors.primary : colors.onSurfaceVariant} />
          </button>

          {/* Text color */}
          <div style={{ position: 'relative' }}>
            <button className="lore-toolbar-btn" onMouseDown={pd}
              onClick={() => { setTextColorOpen(!textColorOpen); setFontSizeOpen(false); setHighlightOpen(false); }}
              data-tooltip="Text color" type="button">
              <Icon name="format-color-text" size={18} color={colors.onSurfaceVariant} />
            </button>
            {textColorOpen ? (
              <div className="lore-toolbar-dropdown lore-toolbar-color-grid">
                {TEXT_COLORS.map((c) => (
                  <button key={c} className="lore-toolbar-color-swatch" type="button" style={{ background: c }}
                    onMouseDown={pd}
                    onClick={() => { execCmd('foreColor', c); setTextColorOpen(false); }} />
                ))}
              </div>
            ) : null}
          </div>

          {/* Highlight */}
          <div style={{ position: 'relative' }}>
            <button className="lore-toolbar-btn" onMouseDown={pd}
              onClick={() => { setHighlightOpen(!highlightOpen); setFontSizeOpen(false); setTextColorOpen(false); }}
              data-tooltip="Highlight" type="button">
              <Icon name="format-color-fill" size={18} color={colors.onSurfaceVariant} />
            </button>
            {highlightOpen ? (
              <div className="lore-toolbar-dropdown lore-toolbar-color-grid">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button key={c} className="lore-toolbar-color-swatch" type="button"
                    style={{ background: c === 'transparent' ? colors.surfaceContainerHigh : c, border: c === 'transparent' ? `1px dashed ${colors.outline}` : 'none' }}
                    onMouseDown={pd}
                    onClick={() => { execCmd('hiliteColor', c); setHighlightOpen(false); }} />
                ))}
              </div>
            ) : null}
          </div>

          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('superscript')} data-tooltip="Superscript" type="button">
            <span className="lore-toolbar-text-label">x<sup>2</sup></span>
          </button>
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('subscript')} data-tooltip="Subscript" type="button">
            <span className="lore-toolbar-text-label">x<sub>2</sub></span>
          </button>
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('removeFormat')} data-tooltip="Clear formatting" type="button">
            <Icon name="format-clear" size={18} color={colors.onSurfaceVariant} />
          </button>

          <div className="lore-toolbar-sep" />

          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('formatBlock', 'h2')} data-tooltip="Heading" type="button">
            <Icon name="title" size={18} color={colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('insertUnorderedList') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('insertUnorderedList')} data-tooltip="Bullet list (Ctrl+.)" data-tooltip-desc="Start an unordered list." type="button">
            <Icon name="format-list-bulleted" size={18} color={activeFormats.has('insertUnorderedList') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className={`lore-toolbar-btn${activeFormats.has('insertOrderedList') ? ' lore-toolbar-active' : ''}`} onMouseDown={pd} onClick={() => execCmd('insertOrderedList')} data-tooltip="Numbered list (Ctrl+/)" data-tooltip-desc="Start an ordered list." type="button">
            <Icon name="format-list-numbered" size={18} color={activeFormats.has('insertOrderedList') ? colors.primary : colors.onSurfaceVariant} />
          </button>
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('outdent')} data-tooltip="Decrease indent" type="button">
            <Icon name="format-indent-decrease" size={18} color={colors.onSurfaceVariant} />
          </button>
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('indent')} data-tooltip="Increase indent" type="button">
            <Icon name="format-indent-increase" size={18} color={colors.onSurfaceVariant} />
          </button>

          <div className="lore-toolbar-sep" />

          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('justifyLeft')} data-tooltip="Align left" type="button">
            <Icon name="format-align-left" size={18} color={colors.onSurfaceVariant} />
          </button>
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('justifyCenter')} data-tooltip="Align center" type="button">
            <Icon name="format-align-center" size={18} color={colors.onSurfaceVariant} />
          </button>
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('justifyRight')} data-tooltip="Align right" type="button">
            <Icon name="format-align-right" size={18} color={colors.onSurfaceVariant} />
          </button>
          <button className="lore-toolbar-btn" onMouseDown={pd} onClick={() => execCmd('justifyFull')} data-tooltip="Justify" type="button">
            <Icon name="format-align-justify" size={18} color={colors.onSurfaceVariant} />
          </button>

          <div className="lore-toolbar-sep" />

          <button ref={tableButtonRef} className="lore-toolbar-btn" onMouseDown={pd}
            onClick={() => { setTablePicker(!tablePicker); setFontSizeOpen(false); setTextColorOpen(false); setHighlightOpen(false); }}
            data-tooltip="Insert table" type="button">
            <Icon name="table-chart" size={18} color={colors.onSurfaceVariant} />
          </button>
        </div>
      ) : null}

      {tablePicker ? (
        <TablePicker
          onSelect={handleTableInsert}
          onClose={() => setTablePicker(false)}
          anchorRect={tableButtonRef.current?.getBoundingClientRect() ?? null}
        />
      ) : null}

      {mentionState && mentionablePages ? (
        <MentionTypeahead
          query={mentionState.query}
          pages={mentionablePages}
          position={mentionState.position}
          onSelect={handleMentionSelect}
          onClose={() => setMentionState(null)}
          getSectionLabel={getSectionLabel}
        />
      ) : null}

      <div
        ref={canvasRef}
        className="lore-canvas"
        onClick={handleCanvasClick}
        onContextMenu={handleCanvasContextMenu as any}
        style={{ minHeight: 'calc(100vh - 160px)', position: 'relative', cursor: editable ? 'text' : 'default' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1, height: contentHeight, pointerEvents: 'none' }} />
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
              zIndex: draggingId === block.id ? 3 : focusedId === block.id ? 2 : 1,
            }}
            onClick={(e) => {
              const chip = (e.target as HTMLElement).closest?.('.vaultstone-mention') as HTMLElement | null;
              if (chip) {
                if (chip.classList.contains('vaultstone-mention--deleted')) {
                  e.preventDefault(); e.stopPropagation(); return;
                }
                const id = chip.getAttribute('data-id');
                if (id && onMentionClick) { e.preventDefault(); flushPendingSave(); onMentionClick(id); return; }
              }
              e.stopPropagation();
            }}
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
              onFocus={(id: string) => { setFocusedId(id); setPendingClick(null); }}
              onBlur={handleBlockBlur}
              onPaste={handleBlockPaste}
              onImageResize={handleImageResize}
              onImageDrag={handleImageDrag}
              onDeleteImage={handleDeleteBlock}
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
                <div className="lore-resize-right" onMouseDown={(e) => handleResizeStart(block.id, e)} />
              </>
            ) : null}
          </div>
        ))}
        {pendingClick ? (
          <div className="lore-pending-cursor" style={{ left: pendingClick.x + 28, top: pendingClick.y + 8 }} />
        ) : null}
        {blocks.length === 0 && !pendingClick && editable ? (
          <div className="lore-canvas-empty">
            Click anywhere to start writing…
          </div>
        ) : null}
        {/* Image right-click menu — caption editor + pin actions.
            Anchored at the click position relative to the canvas
            so it appears over the image without portal plumbing. */}
        {imageMenu ? (
          <div
            className="lore-image-menu"
            style={{ left: imageMenu.x, top: imageMenu.y }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {imageMenu.mode === 'root' ? (
              <div className="lore-image-menu-list">
                <button
                  type="button"
                  className="lore-image-menu-item"
                  onClick={openImageCaptionEditor}
                >
                  <span className="lore-image-menu-icon">✏</span>
                  <span className="lore-image-menu-label">Edit caption</span>
                </button>
                <div className="lore-image-menu-sep" />
                <button
                  type="button"
                  className={`lore-image-menu-item${!canPin ? ' disabled' : ''}`}
                  onClick={canPin ? chooseImageScene : undefined}
                  disabled={!canPin}
                  title={!canPin ? "No DM'd campaign linked to this world" : undefined}
                >
                  <span className="lore-image-menu-icon">🖼</span>
                  <span className="lore-image-menu-label">Pin to Scene</span>
                </button>
                <button
                  type="button"
                  className={`lore-image-menu-item${!canPin ? ' disabled' : ''}`}
                  onClick={canPin ? chooseImageSubject : undefined}
                  disabled={!canPin}
                >
                  <span className="lore-image-menu-icon">👤</span>
                  <span className="lore-image-menu-label">Pin as Subject</span>
                </button>
              </div>
            ) : null}
            {imageMenu.mode === 'caption' ? (
              <div className="lore-image-menu-pane">
                <div className="lore-image-menu-paneLabel">Caption</div>
                <textarea
                  value={imageMenuDraftCaption}
                  onChange={(e) => setImageMenuDraftCaption(e.target.value)}
                  placeholder="What is shown? (optional)"
                  className="lore-image-menu-input"
                  autoFocus
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setImageMenu(null);
                    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void commitImageCaption();
                    }
                  }}
                />
                <div className="lore-image-menu-row">
                  <button type="button" className="lore-image-menu-btn ghost"
                    onClick={() => setImageMenu(null)}>
                    Cancel
                  </button>
                  <button type="button" className="lore-image-menu-btn primary"
                    onClick={commitImageCaption} disabled={imageMenuSaving}>
                    {imageMenuSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : null}
            {(imageMenu.mode === 'pin-scene' || imageMenu.mode === 'pin-subject')
              && imageMenuDMCampaigns ? (
              <div className="lore-image-menu-pane">
                <div className="lore-image-menu-paneLabel">
                  {imageMenu.mode === 'pin-scene' ? 'Pin as Scene in…' : 'Pin as Subject in…'}
                </div>
                <div className="lore-image-menu-list">
                  {imageMenuDMCampaigns.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="lore-image-menu-item"
                      onClick={() =>
                        pinImageSlot(imageMenu.mode === 'pin-scene' ? 'scene' : 'subject', c.id)
                      }
                      disabled={imageMenuSaving}
                    >
                      <span className="lore-image-menu-label">{c.name}</span>
                    </button>
                  ))}
                </div>
                <div className="lore-image-menu-row">
                  <button type="button" className="lore-image-menu-btn ghost"
                    onClick={() => setImageMenu({ ...imageMenu, mode: 'root' })}>
                    Back
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {/* Pin-flow crop modal — mounts when the user picks a slot
          and we need their crop. Confirmed crop uploads as a new
          world_images record (caller decides; see commitPin) and
          commits the pin. Cancel discards the pending pin. */}
      {pendingPin ? (
        <ImageCropModal
          visible
          imageUri={pendingPin.signedUrl}
          aspect={pendingPin.aspect}
          usageHint={
            pendingPin.slot === 'scene'
              ? 'Scene fills the campaign window pane background (16:9).'
              : 'Subject overlays the top-right of the scene (9:16 portrait).'
          }
          onCancel={() => setPendingPin(null)}
          onConfirm={handlePinCropConfirm}
        />
      ) : null}
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
            gap: 1px;
            padding: 4px 8px;
            background: ${colors.surfaceContainer};
            border-bottom: 1px solid ${colors.outlineVariant}22;
            position: sticky;
            top: 0;
            z-index: 10;
            flex-wrap: wrap;
          }
          .lore-toolbar-mobile {
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            gap: 2px;
            padding: 6px 8px;
          }
          .lore-toolbar-mobile::-webkit-scrollbar {
            display: none;
          }
          .lore-toolbar-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            border: none;
            background: transparent;
            border-radius: 4px;
            cursor: pointer;
            padding: 0;
            flex-shrink: 0;
          }
          .lore-toolbar-btn:hover {
            background: ${colors.surfaceContainerHigh};
          }
          .lore-toolbar-btn.lore-toolbar-active {
            background: ${colors.primaryContainer}33;
          }
          .lore-toolbar-btn[data-tooltip] {
            position: relative;
          }
          .lore-toolbar-btn[data-tooltip]:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            margin-top: 6px;
            background: ${colors.surfaceContainerHighest};
            color: ${colors.onSurface};
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 12px;
            font-weight: 700;
            line-height: 1.5;
            padding: 6px 10px;
            border-radius: 6px;
            white-space: nowrap;
            z-index: 50;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            border: 1px solid ${colors.outlineVariant}44;
          }
          .lore-toolbar-btn-wide {
            width: auto;
            padding: 0 6px;
            gap: 2px;
          }
          .lore-toolbar-label {
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 11px;
            color: ${colors.onSurfaceVariant};
          }
          .lore-toolbar-text-label {
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 13px;
            color: ${colors.onSurfaceVariant};
            line-height: 1;
          }
          .lore-toolbar-text-label sup, .lore-toolbar-text-label sub {
            font-size: 9px;
          }
          .lore-toolbar-sep {
            width: 1px;
            height: 20px;
            background: ${colors.outlineVariant}33;
            margin: 0 4px;
            flex-shrink: 0;
          }
          .lore-toolbar-dropdown {
            position: absolute;
            top: 32px;
            left: 0;
            background: ${colors.surfaceContainerHigh};
            border: 1px solid ${colors.outlineVariant}55;
            border-radius: 6px;
            padding: 4px;
            z-index: 20;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            min-width: 60px;
          }
          .lore-toolbar-dropdown-item {
            display: block;
            width: 100%;
            border: none;
            background: transparent;
            padding: 4px 10px;
            text-align: left;
            cursor: pointer;
            color: ${colors.onSurface};
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 12px;
            border-radius: 4px;
          }
          .lore-toolbar-dropdown-item:hover {
            background: ${colors.primaryContainer}33;
          }
          .lore-toolbar-color-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 4px;
            padding: 6px;
            min-width: 120px;
          }
          .lore-toolbar-color-swatch {
            width: 24px;
            height: 24px;
            border-radius: 4px;
            border: 1px solid ${colors.outlineVariant}44;
            cursor: pointer;
            padding: 0;
          }
          .lore-toolbar-color-swatch:hover {
            transform: scale(1.15);
          }

          /* Pending cursor */
          .lore-pending-cursor {
            position: absolute;
            width: 2px;
            height: 20px;
            background: ${colors.primary};
            border-radius: 1px;
            animation: lore-blink 1s step-end infinite;
            pointer-events: none;
          }
          @keyframes lore-blink {
            50% { opacity: 0; }
          }

          /* Table picker */
          .lore-table-picker-backdrop {
            position: fixed;
            inset: 0;
            z-index: 100;
          }
          .lore-table-picker {
            background: ${colors.surfaceContainerHigh};
            border: 1px solid ${colors.outlineVariant}55;
            border-radius: 8px;
            padding: 12px;
            box-shadow: 0 12px 40px rgba(0,0,0,0.5);
            z-index: 101;
          }
          .lore-table-picker-label {
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 12px;
            color: ${colors.onSurfaceVariant};
            text-align: center;
            margin-bottom: 8px;
          }
          .lore-table-picker-grid {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .lore-table-picker-cell {
            width: 22px;
            height: 22px;
            border: 1px solid ${colors.outlineVariant}55;
            border-radius: 3px;
            cursor: pointer;
            transition: background 0.1s;
          }
          .lore-table-picker-cell:hover {
            border-color: ${colors.primary}66;
          }
          .lore-table-picker-cell.active {
            background: ${colors.primaryContainer}55;
            border-color: ${colors.primary};
          }

          .lore-canvas {
            background: ${colors.surfaceCanvas};
            border: 1px solid ${colors.outlineVariant}22;
            border-radius: ${radius.lg}px;
            overflow: auto;
            scroll-behavior: smooth;
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
          /* Image right-click menu — caption editor + pin actions.
             Mirrors the Tiptap node-view menu styling so the look is
             identical in both editors. */
          .lore-image-menu {
            position: absolute;
            z-index: 50;
            min-width: 220px;
            background: ${colors.surfaceContainerHigh};
            border: 1px solid ${colors.outlineVariant};
            border-radius: 8px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
            overflow: hidden;
          }
          .lore-image-menu-list {
            display: flex;
            flex-direction: column;
            padding: 4px;
          }
          .lore-image-menu-sep {
            height: 1px;
            background: ${colors.outlineVariant}88;
            margin: 4px 6px;
          }
          .lore-image-menu-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            border: none;
            background: transparent;
            color: ${colors.onSurface};
            font-family: 'Manrope', system-ui, sans-serif;
            font-size: 13px;
            text-align: left;
            cursor: pointer;
            border-radius: 6px;
          }
          .lore-image-menu-item:not(.disabled):hover {
            background: ${colors.surfaceContainer};
          }
          .lore-image-menu-item.disabled {
            color: ${colors.outline};
            cursor: not-allowed;
          }
          .lore-image-menu-icon { width: 18px; text-align: center; font-size: 14px; }
          .lore-image-menu-label { flex: 1; }
          .lore-image-menu-pane {
            padding: 10px 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            width: 280px;
          }
          .lore-image-menu-paneLabel {
            font-family: 'Manrope', system-ui, sans-serif;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: ${colors.outline};
          }
          .lore-image-menu-input {
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
          .lore-image-menu-input:focus {
            border-color: ${colors.primary};
          }
          .lore-image-menu-row {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
          }
          .lore-image-menu-btn {
            font-family: 'Manrope', system-ui, sans-serif;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid transparent;
          }
          .lore-image-menu-btn.ghost {
            background: transparent;
            color: ${colors.onSurfaceVariant};
            border-color: ${colors.outlineVariant};
          }
          .lore-image-menu-btn.primary {
            background: ${colors.primary};
            color: ${colors.onPrimary};
          }
          .lore-image-menu-btn.primary:disabled {
            opacity: 0.6;
            cursor: progress;
          }
          .lore-block {
            border: 1px solid transparent;
            border-radius: 6px;
            padding: 0;
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
          .lore-block-handle:active { cursor: grabbing; }
          .lore-block-content {
            outline: none;
            color: #ffffff;
            font-family: 'CormorantGaramond_400Regular', 'Cormorant Garamond', Georgia, serif;
            font-size: 16px;
            line-height: 1.7;
            min-height: 1.7em;
            white-space: pre-wrap;
            word-wrap: break-word;
            padding: 8px 12px;
          }
          .lore-block-content p { margin: 0 0 4px 0; }
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

          /* Images */
          .lore-block-content img {
            border-radius: 6px;
            display: block;
            margin: 4px 0;
            cursor: pointer;
          }
          .lore-block-content img.lore-img-selected {
            outline: 2px solid ${colors.primary};
            outline-offset: 2px;
          }
          .lore-img-resize-wrap {
            display: inline-block;
            position: relative;
          }
          .lore-img-handle {
            position: absolute;
            background: ${colors.primary};
            border: 2px solid ${colors.surfaceCanvas};
            border-radius: 3px;
            z-index: 5;
          }
          .lore-img-handle:hover { background: ${colors.primaryContainer}; transform: scale(1.15); }
          .lore-img-handle-corner { width: 12px; height: 12px; right: -5px; bottom: -5px; cursor: nwse-resize; }
          .lore-img-handle-right { width: 8px; height: 20px; right: -5px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
          .lore-img-handle-right:hover { transform: translateY(-50%) scale(1.15); }
          .lore-img-handle-left { width: 8px; height: 20px; left: -5px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
          .lore-img-handle-left:hover { transform: translateY(-50%) scale(1.15); }
          .lore-img-handle-top { width: 20px; height: 8px; top: -5px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
          .lore-img-handle-top:hover { transform: translateX(-50%) scale(1.15); }
          .lore-img-handle-bottom { width: 20px; height: 8px; bottom: -5px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
          .lore-img-handle-bottom:hover { transform: translateX(-50%) scale(1.15); }
          .lore-img-drag-ghost {
            position: absolute;
            opacity: 0.6;
            pointer-events: none;
            border-radius: 6px;
            z-index: 50;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          }

          /* Tables */
          .lore-block-content table {
            width: 100%;
            border-collapse: collapse;
            margin: 8px 0;
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 13px;
            line-height: 1.5;
          }
          .lore-block-content th, .lore-block-content td {
            border: 1px solid ${colors.outlineVariant}55;
            padding: 6px 10px;
            text-align: left;
            vertical-align: top;
            min-width: 60px;
          }
          .lore-block-content th {
            background: ${colors.surfaceContainerHigh};
            color: ${colors.onSurface};
            font-weight: 600;
            font-size: 11px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .lore-block-content td { color: ${colors.onSurfaceVariant}; }
          .lore-block-content tr:hover td { background: ${colors.surfaceContainerHigh}44; }

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
          .lore-block-delete:hover { opacity: 1; color: ${colors.hpDanger}; }
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
          .lore-resize-right:hover { background: ${colors.primary}44; }

          /* Mention chips */
          .lore-block-content .vaultstone-mention {
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
          .lore-block-content .vaultstone-mention:hover {
            background: ${colors.primary}26;
            border-color: ${colors.primary}55;
          }
          .lore-block-content .vaultstone-mention--deleted {
            background: ${colors.outlineVariant}22;
            color: ${colors.outline};
            border-color: ${colors.outlineVariant}33;
            cursor: default;
            text-decoration: line-through;
          }
          .lore-block-content .vaultstone-mention--deleted:hover {
            background: ${colors.outlineVariant}22;
            border-color: ${colors.outlineVariant}33;
          }

          /* Mention popup */
          .lore-mention-popup {
            position: fixed;
            z-index: 1000;
          }
          .lore-mention-list {
            background: ${colors.surfaceContainerHigh};
            border: 1px solid ${colors.outlineVariant}55;
            border-radius: 8px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.45);
            min-width: 220px;
            max-width: 320px;
            padding: 4px;
            overflow: hidden;
          }
          .lore-mention-empty {
            background: ${colors.surfaceContainerHigh};
            border: 1px solid ${colors.outlineVariant}55;
            border-radius: 8px;
            color: ${colors.onSurfaceVariant};
            padding: 8px 12px;
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
            font-size: 13px;
            font-style: italic;
          }
          .lore-mention-item {
            display: flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            background: transparent;
            border: none;
            border-radius: 6px;
            padding: 6px 8px;
            text-align: left;
            cursor: pointer;
            color: ${colors.onSurface};
            font-family: 'Manrope_400Regular', 'Manrope', system-ui, sans-serif;
          }
          .lore-mention-item.active,
          .lore-mention-item:hover {
            background: ${colors.primaryContainer}33;
          }
          .lore-mention-item-icon {
            font-size: 14px;
            width: 22px;
            text-align: center;
            flex-shrink: 0;
          }
          .lore-mention-item-text {
            display: flex;
            flex-direction: column;
            min-width: 0;
            flex: 1;
          }
          .lore-mention-item-title {
            font-size: 13px;
            font-weight: 500;
            color: ${colors.onSurface};
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .lore-mention-item-meta {
            font-size: 10px;
            color: ${colors.onSurfaceVariant};
            text-transform: uppercase;
            letter-spacing: 0.4px;
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
