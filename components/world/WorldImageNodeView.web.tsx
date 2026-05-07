import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  getCampaignsForWorld,
  getWorldImageSignedUrlById,
  updateWorldImageCaption,
} from '@vaultstone/api';
import { useAuthStore } from '@vaultstone/store';
import { colors, ImageCropModal, spacing } from '@vaultstone/ui';
import { commitPin, decidePinFlow, type PinSlot } from './pinImageWithCrop';

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

type DMCampaign = { id: string; name: string };

/**
 * Per-world cache of campaigns the current user DMs. The right-click
 * menu reads this to decide whether pin actions are available and
 * whether to offer a campaign sub-list (multiple) or pin directly
 * (single). Cached because right-clicks happen often and campaign
 * membership rarely changes mid-session.
 */
const dmCampaignsCache = new Map<string, { entries: DMCampaign[]; ts: number }>();
const DM_CAMPAIGNS_TTL_MS = 30 * 1000;

async function loadDMCampaigns(worldId: string, userId: string): Promise<DMCampaign[]> {
  const cacheKey = `${worldId}:${userId}`;
  const cached = dmCampaignsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DM_CAMPAIGNS_TTL_MS) return cached.entries;

  const { data } = await getCampaignsForWorld(worldId);
  // Cast through unknown — the FK metadata for world_campaigns ↔
  // campaigns isn't reflected in the generated types, so the join
  // result types as a SelectQueryError instead of the embedded row.
  const rows = (data ?? []) as unknown as Array<{
    campaigns: { id: string; name: string; dm_user_id: string } | null;
  }>;
  const entries: DMCampaign[] = rows
    .map((r) => r.campaigns)
    .filter((c): c is { id: string; name: string; dm_user_id: string } =>
      !!c && c.dm_user_id === userId)
    .map((c) => ({ id: c.id, name: c.name }));
  dmCampaignsCache.set(cacheKey, { entries, ts: Date.now() });
  return entries;
}

type MenuMode = 'root' | 'caption' | 'pin-scene' | 'pin-subject';

export function WorldImageNodeView(props: NodeViewProps) {
  const { node, selected, editor, getPos, extension } = props;
  const imageId = node.attrs.imageId as string;
  const alt = (node.attrs.alt as string) ?? '';
  const caption = ((node.attrs.caption as string) ?? '') || alt;
  const width = (node.attrs.width as number) ?? 0;
  const height = (node.attrs.height as number) ?? 0;
  const worldId = (extension.options as { worldId?: string }).worldId;

  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMode, setMenuMode] = useState<MenuMode>('root');
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [draftCaption, setDraftCaption] = useState('');
  const [saving, setSaving] = useState(false);
  // Pending pin — populated when the user picks Scene or Subject;
  // mounts the crop modal at the slot's aspect. Cleared on
  // confirm/cancel.
  const [pendingPin, setPendingPin] = useState<{
    campaignId: string;
    slot: PinSlot;
    aspect: [number, number];
    signedUrl: string;
  } | null>(null);
  const [dmCampaigns, setDmCampaigns] = useState<DMCampaign[] | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const userId = useAuthStore((s) => s.user?.id ?? null);

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
      if (url) setSrc(url);
      else setError(true);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [imageId]);

  // Load DM-able campaigns on first menu open. Avoids a request on
  // every page load; the menu is the only consumer.
  useEffect(() => {
    if (!menuOpen || !worldId || !userId) return;
    if (dmCampaigns !== null) return;
    let cancelled = false;
    loadDMCampaigns(worldId, userId).then((entries) => {
      if (!cancelled) setDmCampaigns(entries);
    });
    return () => { cancelled = true; };
  }, [menuOpen, worldId, userId, dmCampaigns]);

  // Close the menu when the user clicks anywhere else on the page.
  useEffect(() => {
    if (!menuOpen) return;
    function handleAway(e: MouseEvent) {
      const target = e.target as Node | null;
      if (target && wrapperRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    window.addEventListener('mousedown', handleAway);
    return () => window.removeEventListener('mousedown', handleAway);
  }, [menuOpen]);

  const aspectRatio = width && height ? width / height : undefined;

  const canPin = !!worldId && !!userId && (dmCampaigns?.length ?? 0) > 0;

  function openMenu(e: React.MouseEvent<HTMLDivElement>) {
    if (!editor.isEditable || !imageId) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = wrapperRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;
    setMenuPos({ x, y });
    setMenuMode('root');
    setMenuOpen(true);
  }

  function selectThisNode() {
    const pos = typeof getPos === 'function' ? getPos() : null;
    if (pos != null) editor.chain().setNodeSelection(pos).run();
  }

  // ── Caption sub-mode ──────────────────────────────────────────────
  function openCaption() {
    setDraftCaption((node.attrs.caption as string) ?? '');
    setMenuMode('caption');
  }

  async function commitCaption() {
    if (!imageId || saving) return;
    setSaving(true);
    const { error: dbErr } = await updateWorldImageCaption(imageId, draftCaption);
    setSaving(false);
    if (dbErr) return;
    selectThisNode();
    editor.chain().setWorldImageCaption(draftCaption).run();
    setMenuOpen(false);
  }

  // ── Pin sub-modes ─────────────────────────────────────────────────
  async function pinSlot(slot: PinSlot, campaignId: string) {
    if (!imageId) return;
    setSaving(true);
    const decision = await decidePinFlow({ imageId, slot });
    setSaving(false);
    setMenuOpen(false);
    if (!decision) return;
    // Always show the crop modal — even matching aspects benefit
    // from the user confirming framing (the slot might want a
    // specific subject in frame, not the source's whole canvas).
    setPendingPin({
      campaignId,
      slot,
      aspect: decision.aspect,
      signedUrl: decision.signedUrl,
    });
  }

  async function handlePinCropConfirm(croppedBlobUri: string) {
    if (!pendingPin || !worldId || !imageId) return;
    await commitPin({
      campaignId: pendingPin.campaignId,
      worldId,
      slot: pendingPin.slot,
      sourceImageId: imageId,
      sourceWidth: width,
      sourceHeight: height,
      aspect: pendingPin.aspect,
      croppedBlobUri,
    });
    setPendingPin(null);
  }

  // Pin actions: when there's only one DM-able campaign, the menu
  // commits the pin directly. With multiple, it opens a sub-list of
  // campaign names.
  function chooseScene() {
    if (!dmCampaigns || dmCampaigns.length === 0) return;
    if (dmCampaigns.length === 1) {
      void pinSlot('scene', dmCampaigns[0]!.id);
      return;
    }
    setMenuMode('pin-scene');
  }
  function chooseSubject() {
    if (!dmCampaigns || dmCampaigns.length === 0) return;
    if (dmCampaigns.length === 1) {
      void pinSlot('subject', dmCampaigns[0]!.id);
      return;
    }
    setMenuMode('pin-subject');
  }

  return (
    <NodeViewWrapper
      ref={wrapperRef as never}
      className={`world-image-wrapper${selected ? ' selected' : ''}`}
      data-drag-handle=""
      onContextMenu={openMenu as never}
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

      {menuOpen && menuPos ? (
        <div
          className="world-image-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menuMode === 'root' ? (
            <RootMenu
              onCaption={openCaption}
              onPinScene={chooseScene}
              onPinSubject={chooseSubject}
              canPin={canPin}
              dmCampaignsLoaded={dmCampaigns !== null}
            />
          ) : null}
          {menuMode === 'caption' ? (
            <CaptionEditor
              draft={draftCaption}
              onChange={setDraftCaption}
              onCancel={() => setMenuOpen(false)}
              onSave={commitCaption}
              saving={saving}
            />
          ) : null}
          {(menuMode === 'pin-scene' || menuMode === 'pin-subject') && dmCampaigns ? (
            <CampaignChooser
              label={menuMode === 'pin-scene' ? 'Pin as Scene in…' : 'Pin as Subject in…'}
              campaigns={dmCampaigns}
              onPick={(id) =>
                pinSlot(menuMode === 'pin-scene' ? 'scene' : 'subject', id)
              }
              onBack={() => setMenuMode('root')}
              busy={saving}
            />
          ) : null}
        </div>
      ) : null}
      {/* Pin-flow crop modal — opens when the user picks a slot.
          Always shown so the user can frame the slot intentionally,
          even when the source's aspect already matches. Confirmed
          crop uploads as a new world_images record (see commitPin)
          and pins it. */}
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
    </NodeViewWrapper>
  );
}

// ── Inline menu pieces ──────────────────────────────────────────────

function RootMenu({
  onCaption,
  onPinScene,
  onPinSubject,
  canPin,
  dmCampaignsLoaded,
}: {
  onCaption: () => void;
  onPinScene: () => void;
  onPinSubject: () => void;
  canPin: boolean;
  dmCampaignsLoaded: boolean;
}) {
  const pinDisabled = !canPin && dmCampaignsLoaded;
  const pinLoading = !dmCampaignsLoaded;
  return (
    <div className="world-image-menu-list">
      <MenuItem icon="✏" label="Edit caption" onClick={onCaption} />
      <div className="world-image-menu-sep" />
      <MenuItem
        icon="🖼"
        label={pinLoading ? 'Pin to Scene…' : 'Pin to Scene'}
        onClick={onPinScene}
        disabled={pinDisabled}
        hint={pinDisabled ? 'No DM\'d campaign linked to this world' : undefined}
      />
      <MenuItem
        icon="👤"
        label={pinLoading ? 'Pin as Subject…' : 'Pin as Subject'}
        onClick={onPinSubject}
        disabled={pinDisabled}
      />
    </div>
  );
}

function MenuItem({
  icon, label, onClick, disabled, hint,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      className={`world-image-menu-item${disabled ? ' disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={hint}
    >
      <span className="world-image-menu-icon">{icon}</span>
      <span className="world-image-menu-label">{label}</span>
    </button>
  );
}

function CaptionEditor({
  draft, onChange, onCancel, onSave, saving,
}: {
  draft: string;
  onChange: (s: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="world-image-menu-pane">
      <div className="world-image-menu-paneLabel">Caption</div>
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What is shown? (optional)"
        className="world-image-menu-input"
        autoFocus
        rows={3}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <div className="world-image-menu-row">
        <button type="button" className="world-image-menu-btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="world-image-menu-btn primary"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function CampaignChooser({
  label, campaigns, onPick, onBack, busy,
}: {
  label: string;
  campaigns: DMCampaign[];
  onPick: (id: string) => void;
  onBack: () => void;
  busy: boolean;
}) {
  return (
    <div className="world-image-menu-pane">
      <div className="world-image-menu-paneLabel">{label}</div>
      <div className="world-image-menu-list">
        {campaigns.map((c) => (
          <button
            key={c.id}
            type="button"
            className="world-image-menu-item"
            onClick={() => onPick(c.id)}
            disabled={busy}
          >
            <span className="world-image-menu-label">{c.name}</span>
          </button>
        ))}
      </div>
      <div className="world-image-menu-row">
        <button type="button" className="world-image-menu-btn ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
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
    .world-image-menu {
      position: absolute;
      z-index: 50;
      min-width: 220px;
      background: ${colors.surfaceContainerHigh};
      border: 1px solid ${colors.outlineVariant};
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      overflow: hidden;
    }
    .world-image-menu-list {
      display: flex;
      flex-direction: column;
      padding: 4px;
    }
    .world-image-menu-sep {
      height: 1px;
      background: ${colors.outlineVariant}88;
      margin: 4px 6px;
    }
    .world-image-menu-item {
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
    .world-image-menu-item:not(.disabled):hover {
      background: ${colors.surfaceContainer};
    }
    .world-image-menu-item.disabled {
      color: ${colors.outline};
      cursor: not-allowed;
    }
    .world-image-menu-icon {
      width: 18px;
      text-align: center;
      font-size: 14px;
    }
    .world-image-menu-label { flex: 1; }
    .world-image-menu-pane {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 280px;
    }
    .world-image-menu-paneLabel {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: ${colors.outline};
    }
    .world-image-menu-input {
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
    .world-image-menu-input:focus {
      border-color: ${colors.primary};
    }
    .world-image-menu-row {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .world-image-menu-btn {
      font-family: 'Manrope', system-ui, sans-serif;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .world-image-menu-btn.ghost {
      background: transparent;
      color: ${colors.onSurfaceVariant};
      border-color: ${colors.outlineVariant};
    }
    .world-image-menu-btn.primary {
      background: ${colors.primary};
      color: ${colors.onPrimary};
    }
    .world-image-menu-btn.primary:disabled {
      opacity: 0.6;
      cursor: progress;
    }
  `;
}
