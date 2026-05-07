import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  cascadeMentionLabel,
  claimPageEdit,
  forceReleasePageEdit,
  getMap,
  getMapImageSignedUrl,
  getPagesLinkingTo,
  getPinsForPage,
  getEventsReferencingPage,
  releasePageEdit,
  trashPage,
  updatePage,
  type MapPin,
  type WorldMap,
} from '@vaultstone/api';
import type { TimelineEvent } from '@vaultstone/types';
import {
  selectSectionsForWorld,
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { Json, TemplateKey, WorldPage } from '@vaultstone/types';
import {
  Icon,
  Text,
  VisibilityBadge,
  colors,
  fonts,
  radius,
  spacing,
} from '@vaultstone/ui';

import { EditLockBanner } from './EditLockBanner';
import { LoreCanvasEditor } from './LoreCanvasEditor.web';
import { PlayerViewToggle } from './PlayerViewToggle';
import { ShareModal } from './ShareModal';
import { PAGE_KIND_LABEL } from './helpers';
import { usePageVisibilityToggle } from './usePageVisibilityToggle';
import { worldMapHref, worldPageHref, worldSectionHref } from './worldHref';
import {
  type PillDef,
  PillEditor,
  CollapsibleSideSection,
  SideSectionHeader,
  RightTabBtn,
  HookInput,
  formatRelativeTime,
  MENTION_ICON,
  PAGE_SIDEBAR_STYLES as sideStyles,
} from './PageSidebarShared';

const LOCK_HEARTBEAT_MS = 30_000;
const MAP_PREVIEW_H = 120;
const MAP_ZOOM = 3;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Props = { page: WorldPage; worldId: string; splitMode?: boolean };
type RightTab = 'on_this_page' | 'sub_pages';
type Relationship = { targetPageId: string; type: string; note?: string };

const STANCE_COLOR: Record<string, string> = {
  hostile: colors.hpDanger,
  wary: colors.hpWarning,
  neutral: colors.outline,
  friendly: colors.hpHealthy,
  allied: colors.primary,
};

const SECRECY_COLOR: Record<string, string> = {
  public: colors.outline,
  known: colors.onSurfaceVariant,
  secret: colors.hpWarning,
  hidden: colors.hpDanger,
};

const FACTION_REL_TYPES = [
  'ally', 'rival', 'enemy', 'vassal', 'patron', 'schism', 'trade partner', 'other',
] as const;

// ── Inline page_ref picker (for Leader / HQ in header) ──

function InlinePagePicker({ label, icon, value, candidates, onSelect, accentColor, worldId }: {
  label: string;
  icon: string;
  value: WorldPage | null;
  candidates: WorldPage[];
  onSelect: (id: string | null) => void;
  accentColor: string;
  worldId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const filtered = search
    ? candidates.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
    : candidates;

  function handleOpen() {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
  }

  return (
    <div ref={triggerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <div
        onClick={handleOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          padding: '4px 10px',
          borderRadius: 8,
          border: `1px solid ${value ? accentColor + '44' : colors.outlineVariant + '44'}`,
          background: value ? accentColor + '11' : 'transparent',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={(e: any) => { e.currentTarget.style.background = value ? accentColor + '22' : colors.surfaceContainerHigh; }}
        onMouseLeave={(e: any) => { e.currentTarget.style.background = value ? accentColor + '11' : 'transparent'; }}
      >
        <span style={{
          fontFamily: "'Manrope', system-ui, sans-serif",
          fontSize: 11,
          color: colors.outline,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: "'Manrope', system-ui, sans-serif",
          fontSize: 13,
          color: value ? accentColor : colors.outline,
          fontWeight: value ? 600 : 400,
        }}>
          {value?.title ?? '—'}
        </span>
      </div>

      {open ? createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={() => { setOpen(false); setSearch(''); }} />
          <div style={{
            position: 'fixed',
            top: dropdownPos?.top ?? 200,
            left: dropdownPos?.left ?? 100,
            zIndex: 9001,
            background: colors.surfaceContainerHigh,
            border: `1px solid ${colors.outlineVariant}55`,
            borderRadius: 10,
            padding: 12,
            width: 280,
            maxHeight: 340,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            boxSizing: 'border-box' as const,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontFamily: "'Manrope'", fontSize: 11, color: colors.outline, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e: any) => setSearch(e.target.value)}
              autoFocus
              placeholder={`Search ${label.toLowerCase().replace(/:.*/,'')}…`}
              style={{
                width: '100%',
                boxSizing: 'border-box' as const,
                background: colors.surfaceContainerLowest,
                border: `1px solid ${colors.outlineVariant}44`,
                borderRadius: 6,
                padding: '6px 10px',
                color: colors.onSurface,
                fontSize: 13,
                fontFamily: "'Manrope', system-ui, sans-serif",
                outline: 'none',
                marginBottom: 6,
              }}
            />
            {value ? (
              <div
                onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', borderRadius: 6, marginBottom: 4 }}
                onMouseEnter={(e: any) => { e.currentTarget.style.background = colors.surfaceContainer; }}
                onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontFamily: "'Manrope'", fontSize: 12, color: colors.outline, fontStyle: 'italic' }}>Clear selection</span>
              </div>
            ) : null}
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 8, fontFamily: "'Manrope'", fontSize: 12, color: colors.outline, fontStyle: 'italic' }}>
                  {search ? 'No matches.' : 'No pages available.'}
                </div>
              ) : filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); setSearch(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 8px', borderRadius: 6, cursor: 'pointer',
                    background: value?.id === p.id ? colors.primaryContainer + '22' : 'transparent',
                  }}
                  onMouseEnter={(e: any) => { if (value?.id !== p.id) e.currentTarget.style.background = colors.surfaceContainer; }}
                  onMouseLeave={(e: any) => { if (value?.id !== p.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontFamily: "'Manrope'", fontSize: 13, color: colors.onSurface, flex: 1 }}>{p.title}</span>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </div>
  );
}

// ── Map pin preview (copied from LocationPageView) ──

function MapPinPreview({ signedUrl, label, xPct, yPct, mapWidth, mapHeight }: {
  signedUrl: string; label: string; xPct: number; yPct: number; mapWidth: number; mapHeight: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(260);
  useEffect(() => { if (containerRef.current) setContainerW(containerRef.current.offsetWidth); }, []);
  const scaledW = containerW * MAP_ZOOM;
  const scaledH = scaledW * (mapHeight / mapWidth);
  const offsetX = -(xPct * scaledW) + containerW / 2;
  const offsetY = -(yPct * scaledH) + MAP_PREVIEW_H / 2;
  return (
    <div ref={containerRef} style={{ height: MAP_PREVIEW_H, overflow: 'hidden', position: 'relative', borderRadius: 4 }}>
      <img src={signedUrl} alt={label} style={{ position: 'absolute', width: scaledW, height: scaledH, left: offsetX, top: offsetY }} />
      <div style={{
        position: 'absolute', left: '50%', top: '50%', width: 12, height: 12, borderRadius: 6,
        backgroundColor: colors.primary, border: `2px solid ${colors.surfaceCanvas}`,
        marginLeft: -6, marginTop: -6, boxShadow: `0 0 0 3px ${colors.primary}44`, zIndex: 2,
      }} />
    </div>
  );
}

// ── Add Relationship Modal (faction variant) ──

function AddFactionRelModal({ allPages, currentPageId, existingRelationships, onAdd, onClose }: {
  allPages: WorldPage[]; currentPageId: string; existingRelationships: Relationship[];
  onAdd: (rel: Relationship) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [relType, setRelType] = useState<string>('ally');
  const [customType, setCustomType] = useState('');
  const [note, setNote] = useState('');

  const existingIds = new Set(existingRelationships.map((r) => r.targetPageId));
  const candidates = allPages
    .filter((p) => ['faction', 'organization', 'religion', 'npc'].includes(p.page_kind) && p.id !== currentPageId && !existingIds.has(p.id))
    .filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase()));
  const selectedPage = selectedPageId ? allPages.find((p) => p.id === selectedPageId) : null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={relStyles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={relStyles.wrapper}>
          <View style={relStyles.card}>
            <View style={relStyles.header}>
              <Icon name="people" size={18} color={colors.hpWarning} />
              <Text variant="title-md" family="serif-display" weight="semibold" style={{ color: colors.onSurface }}>Add Relationship</Text>
            </View>

            {!selectedPageId ? (
              <>
                <input
                  type="text" value={search} onChange={(e: any) => setSearch(e.target.value)} autoFocus
                  placeholder="Search factions & NPCs…"
                  style={{ width: '100%', background: colors.surfaceContainerLowest, border: `1px solid ${colors.outlineVariant}44`, borderRadius: 8, padding: '8px 12px', color: colors.onSurface, fontSize: 13, fontFamily: "'Manrope', system-ui, sans-serif", outline: 'none', marginBottom: 8 }}
                />
                <ScrollView style={{ maxHeight: 240 }}>
                  {candidates.length === 0 ? (
                    <Text variant="body-sm" style={{ color: colors.outline, padding: 8, fontStyle: 'italic' }}>
                      {search ? 'No matches.' : 'No other factions or NPCs yet.'}
                    </Text>
                  ) : candidates.map((p) => {
                    const isNpc = p.page_kind === 'npc';
                    return (
                      <Pressable key={p.id} onPress={() => setSelectedPageId(p.id)} style={relStyles.npcRow}>
                        <Icon name={isNpc ? 'person' : 'shield'} size={14} color={isNpc ? colors.cosmic : colors.hpWarning} />
                        <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>{p.title}</Text>
                        <Text style={{ fontFamily: fonts.label, fontSize: 10, color: colors.outline, letterSpacing: 0.5 }}>{(PAGE_KIND_LABEL[p.page_kind] ?? 'Page').toUpperCase()}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={relStyles.selectedRow}>
                  <Icon name={selectedPage?.page_kind === 'npc' ? 'person' : 'shield'} size={16} color={selectedPage?.page_kind === 'npc' ? colors.cosmic : colors.hpWarning} />
                  <Text variant="body-md" weight="semibold" style={{ flex: 1, color: colors.onSurface }}>{selectedPage?.title}</Text>
                  <Pressable onPress={() => setSelectedPageId(null)} style={{ padding: 4 }}>
                    <Icon name="close" size={14} color={colors.outline} />
                  </Pressable>
                </View>

                <Text variant="label-sm" uppercase style={{ color: colors.outline, letterSpacing: 1, marginTop: 12, marginBottom: 6 }}>Relationship type</Text>
                <View style={relStyles.typeGrid}>
                  {FACTION_REL_TYPES.map((t) => (
                    <Pressable key={t} onPress={() => setRelType(t)} style={[relStyles.typeChip, relType === t && relStyles.typeChipActive]}>
                      <Text style={[relStyles.typeChipText, relType === t && { color: colors.primary }]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
                    </Pressable>
                  ))}
                </View>

                {relType === 'other' ? (
                  <input type="text" value={customType} onChange={(e: any) => setCustomType(e.target.value)} autoFocus placeholder="Type a custom relationship…"
                    style={{ width: '100%', background: colors.surfaceContainerLowest, border: `1px solid ${colors.outlineVariant}44`, borderRadius: 8, padding: '8px 12px', color: colors.onSurface, fontSize: 13, fontFamily: "'Manrope', system-ui, sans-serif", outline: 'none', marginTop: 8 }} />
                ) : null}

                <input type="text" value={note} onChange={(e: any) => setNote(e.target.value)} placeholder="Optional note"
                  style={{ width: '100%', background: colors.surfaceContainerLowest, border: `1px solid ${colors.outlineVariant}44`, borderRadius: 8, padding: '8px 12px', color: colors.onSurface, fontSize: 13, fontFamily: "'Manrope', system-ui, sans-serif", outline: 'none', marginTop: 12 }} />

                <View style={relStyles.actions}>
                  <Pressable onPress={onClose} style={relStyles.cancelBtn}><Text variant="label-md" style={{ color: colors.outline }}>Cancel</Text></Pressable>
                  <Pressable onPress={() => { const ft = relType === 'other' && customType.trim() ? customType.trim() : relType; onAdd({ targetPageId: selectedPageId, type: ft, note: note.trim() || undefined }); }} style={relStyles.addBtn}>
                    <Text variant="label-md" weight="semibold" style={{ color: colors.primary }}>Add</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const relStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12, 14, 16, 0.55)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  wrapper: { width: '100%', maxWidth: 380 },
  card: { backgroundColor: colors.surfaceContainer, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.outlineVariant + '33', padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  npcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.lg },
  selectedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.lg, backgroundColor: colors.primaryContainer + '22', borderWidth: 1, borderColor: colors.primary + '33' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '44' },
  typeChipActive: { borderColor: colors.primary + '55', backgroundColor: colors.primaryContainer + '22' },
  typeChipText: { fontFamily: fonts.label, fontSize: 11, color: colors.onSurfaceVariant, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.lg },
  addBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.primary + '55', backgroundColor: colors.primaryContainer + '22' },
});

// ══════════════════════════════════════════════════════════════
// ── Main Component ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

type CanvasBlock = { id: string; x: number; y: number; width: number; height?: number; html: string };

export function FactionPageView({ page, worldId, splitMode }: Props) {
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const removePage = usePagesStore((s) => s.removePage);
  const bodyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<{ body: object; bodyText: string; bodyRefs: string[] } | null>(null);

  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const toggleVisibility = usePageVisibilityToggle(page);
  const isWorldOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('on_this_page');
  const [rightPanelOpen, setRightPanelOpen] = useState(!splitMode);
  const [editingPill, setEditingPill] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [addingRelationship, setAddingRelationship] = useState(false);

  const section = useMemo(() => sections.find((s) => s.id === page.section_id) ?? null, [sections, page]);
  const fields = (page.structured_fields as Record<string, unknown>) ?? {};
  const fieldsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateField(key: string, value: unknown) {
    updateFields({ [key]: value });
  }
  function updateFields(patch: Record<string, unknown>) {
    const next = { ...fields, ...patch };
    updatePageInStore(page.id, { structured_fields: next as Json });
    setSaveState('saving');
    if (fieldsTimerRef.current) clearTimeout(fieldsTimerRef.current);
    fieldsTimerRef.current = setTimeout(async () => {
      const { error } = await updatePage(page.id, { structured_fields: next as Json });
      setSaveState(error ? 'error' : 'saved');
    }, 500);
  }

  // Fields
  const size = typeof fields.size === 'string' ? fields.size : '';
  const stance = typeof fields.stance === 'string' ? fields.stance : '';
  const secrecy = typeof fields.secrecy === 'string' ? fields.secrecy : '';
  const doctrine = typeof fields.doctrine === 'string' ? fields.doctrine : '';
  const hooks = Array.isArray(fields.__hooks) ? (fields.__hooks as string[]) : [];
  const relationships: Relationship[] = Array.isArray(fields.__relationships) ? (fields.__relationships as Relationship[]) : [];

  // Leader & HQ (page_refs)
  const leaderId = typeof fields.leader === 'string' ? fields.leader : null;
  const leaderPage = leaderId ? (allPages ?? []).find((p) => p.id === leaderId) ?? null : null;
  const leaderCandidates = useMemo(() => (allPages ?? []).filter((p) => p.page_kind === 'npc'), [allPages]);

  const hqId = typeof fields.headquarters === 'string' ? fields.headquarters : null;
  const hqPage = hqId ? (allPages ?? []).find((p) => p.id === hqId) ?? null : null;
  const hqCandidates = useMemo(() => (allPages ?? []).filter((p) => p.page_kind === 'location'), [allPages]);

  // HQ map pin
  const [hqMapPin, setHqMapPin] = useState<MapPin | null>(null);
  const [hqMapData, setHqMapData] = useState<{ map: WorldMap; signedUrl: string } | null>(null);
  useEffect(() => {
    if (!hqId) { setHqMapPin(null); setHqMapData(null); return; }
    let cancelled = false;
    void (async () => {
      const { data: pins } = await getPinsForPage(hqId);
      if (cancelled || !pins || pins.length === 0) return;
      const pin = pins[0];
      setHqMapPin(pin);
      const { data: map } = await getMap(pin.map_id);
      if (cancelled || !map) return;
      const { data: signed } = await getMapImageSignedUrl(map.image_key);
      if (cancelled || !signed) return;
      setHqMapData({ map, signedUrl: signed.signedUrl });
    })();
    return () => { cancelled = true; };
  }, [hqId]);

  // Members — NPCs whose faction field points to this page
  const members = useMemo(() => {
    const pages = allPages ?? [];
    const byFaction = pages.filter(
      (p) => p.page_kind === 'npc' && (p.structured_fields as Record<string, unknown>)?.faction === page.id,
    );
    if (leaderId && !byFaction.some((p) => p.id === leaderId)) {
      const lp = pages.find((p) => p.id === leaderId);
      if (lp) return [lp, ...byFaction];
    }
    return byFaction;
  }, [allPages, page.id, leaderId]);

  // Lock
  const [lockError, setLockError] = useState<{ ownerId: string; since: string } | null>(null);
  const lockOwnerId = page.editing_user_id ?? null;
  const lockSince = page.editing_since ?? null;
  const lockFresh = lockSince !== null && Date.now() - Date.parse(lockSince) < 90_000;
  const heldByOther = lockFresh && lockOwnerId !== null && myUserId !== null && lockOwnerId !== myUserId;
  const bannerLock = heldByOther ? { ownerId: lockOwnerId as string, since: lockSince as string } : lockError;
  const readOnly = !isWorldOwner || heldByOther;

  const lockCtxRef = useRef({ lockOwnerId, lockSince, myUserId, updatePageInStore });
  lockCtxRef.current = { lockOwnerId, lockSince, myUserId, updatePageInStore };

  const tryClaim = useCallback(async () => {
    if (!page.id || !isWorldOwner) return;
    const { data, error } = await claimPageEdit(page.id);
    const ctx = lockCtxRef.current;
    if (error) {
      const msg = (error as any)?.message ?? '';
      const isLockConflict = msg.includes('locked') || msg.includes('another editor');
      if (isLockConflict && ctx.lockOwnerId && ctx.lockOwnerId !== ctx.myUserId && ctx.lockSince) setLockError({ ownerId: ctx.lockOwnerId, since: ctx.lockSince });
      else if (isLockConflict) setLockError({ ownerId: ctx.lockOwnerId ?? 'unknown', since: ctx.lockSince ?? new Date().toISOString() });
      return;
    }
    if (data) { ctx.updatePageInStore(data.id, { editing_user_id: data.editing_user_id, editing_since: data.editing_since }); setLockError(null); }
  }, [page.id]);

  useEffect(() => {
    void tryClaim();
    const t = setInterval(() => void tryClaim(), LOCK_HEARTBEAT_MS);
    return () => {
      clearInterval(t);
      if (bodyTimerRef.current) {
        clearTimeout(bodyTimerRef.current);
        bodyTimerRef.current = null;
        const pending = pendingBodyRef.current;
        if (pending) { pendingBodyRef.current = null; void updatePage(page.id, { body: pending.body as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs }); }
      }
      void releasePageEdit(page.id);
    };
  }, [page.id, tryClaim]);

  const mentionablePages = useMemo(() => (allPages ?? []).filter((p) => p.id !== page.id), [allPages, page.id]);
  const sectionLabelById = useCallback((id: string) => sections.find((s) => s.id === id)?.name ?? '', [sections]);

  async function flushAndNavigate(targetId: string) {
    if (bodyTimerRef.current) { clearTimeout(bodyTimerRef.current); bodyTimerRef.current = null; }
    const pending = pendingBodyRef.current;
    if (pending) { pendingBodyRef.current = null; await updatePage(page.id, { body: pending.body as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs }); }
    router.push(worldPageHref(worldId, targetId));
  }

  function handleCanvasChange(blocks: CanvasBlock[], plainText: string, bodyRefs: string[]) {
    if (heldByOther) return;
    const body = { __canvas_blocks: blocks };
    pendingBodyRef.current = { body, bodyText: plainText, bodyRefs };
    setSaveState('saving');
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(async () => {
      const pending = pendingBodyRef.current;
      if (!pending) return;
      pendingBodyRef.current = null;
      const { data, error } = await updatePage(page.id, { body: pending.body as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs });
      if (error || !data) { setSaveState('error'); return; }
      updatePageInStore(page.id, { body: data.body, body_text: data.body_text, body_refs: data.body_refs });
      setSaveState('saved');
    }, 800);
  }

  async function handleDeletePage() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await trashPage(page.id);
    removePage(page.id);
    router.replace(worldSectionHref(worldId, page.section_id));
  }

  // Right panel data
  const subpages = useMemo(() => (allPages ?? []).filter((p) => p.parent_page_id === page.id).slice().sort((a, b) => a.sort_order - b.sort_order), [allPages, page.id]);
  const [backlinks, setBacklinks] = useState<WorldPage[]>([]);
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);
  useEffect(() => { let c = false; setBacklinksLoaded(false); void (async () => { const { data } = await getPagesLinkingTo(worldId, page.id); if (!c) { setBacklinks(data ?? []); setBacklinksLoaded(true); } })(); return () => { c = true; }; }, [page.id, worldId]);

  const [seenInPlay, setSeenInPlay] = useState<TimelineEvent[]>([]);
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => { let c = false; setSeenLoaded(false); void (async () => { const { data } = await getEventsReferencingPage(worldId, page.id); if (!c) { setSeenInPlay((data ?? []) as TimelineEvent[]); setSeenLoaded(true); } })(); return () => { c = true; }; }, [page.id, worldId]);

  const mentionedPages = useMemo(() => {
    const refs = page.body_refs ?? [];
    if (refs.length === 0) return [];
    return refs.map((id) => (allPages ?? []).find((p) => p.id === id)).filter((p): p is WorldPage => !!p);
  }, [page.body_refs, allPages]);

  // Property pills
  const SIZE_OPTIONS = ['cell', 'chapter', 'order', 'legion', 'empire'];
  const STANCE_OPTIONS = ['hostile', 'wary', 'neutral', 'friendly', 'allied'];
  const SECRECY_OPTIONS = ['public', 'known', 'secret', 'hidden'];

  const propertyPills: PillDef[] = [
    { key: 'size', label: 'SIZE', value: size, icon: 'groups', fieldType: 'select', options: SIZE_OPTIONS },
    { key: 'stance', label: 'STANCE', value: stance, icon: 'mood', fieldType: 'select', options: STANCE_OPTIONS, color: stance ? STANCE_COLOR[stance] : undefined },
    { key: 'secrecy', label: 'SECRECY', value: secrecy, icon: 'visibility-off', fieldType: 'select', options: SECRECY_OPTIONS, color: secrecy ? SECRECY_COLOR[secrecy] : undefined },
    { key: 'doctrine', label: 'DOCTRINE', value: doctrine, icon: 'format-quote', fieldType: 'text' },
  ];

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved · just now' : saveState === 'error' ? 'Save failed' : '';

  return (
    <View style={splitMode ? styles.rootSplit : styles.root}>
      {!splitMode ? (
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={{ marginRight: 6 }}><Icon name="shield" size={18} color={colors.hpWarning} /></View>
          <Pressable onPress={() => router.push(worldSectionHref(worldId, page.section_id))}>
            <Text style={styles.crumb}>{section?.name?.toUpperCase() ?? 'FACTIONS'}</Text>
          </Pressable>
          <Text style={styles.crumbSep}>/</Text>
          <Text style={styles.crumbActive}>{page.title.toUpperCase()}</Text>
        </View>
        <View style={styles.topBarRight}>
          <PlayerViewToggle />
          <VisibilityBadge
            visibility={page.visible_to_players ? 'player' : 'gm'}
            interactive={isWorldOwner}
            onPress={() => setShareOpen(true)}
          />
          {isWorldOwner ? (
            <Pressable onPress={() => setShareOpen(true)} style={styles.shareBtn}>
              <Icon name="share" size={14} color={colors.onSurfaceVariant} />
              <Text variant="label-md" uppercase weight="semibold" style={{ color: colors.onSurfaceVariant, letterSpacing: 1, fontSize: 11 }}>Share</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      ) : null}

      <View style={styles.headerWrap}>
      {/* ── Title row ── */}
      <View style={styles.factionHead}>
        <View style={{ marginRight: 4 }}><Icon name="shield" size={28} color={colors.hpWarning} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          {editingTitle ? (
            <input
              type="text"
              defaultValue={page.title}
              autoFocus
              onKeyDown={(e: any) => {
                if (e.key === 'Enter') {
                  const v = e.target.value.trim();
                  if (v && v !== page.title) { updatePageInStore(page.id, { title: v }); updatePage(page.id, { title: v }); void cascadeMentionLabel(page.world_id, page.id, v); }
                  setEditingTitle(false);
                }
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              onBlur={(e: any) => {
                const v = e.target.value.trim();
                if (v && v !== page.title) { updatePageInStore(page.id, { title: v }); updatePage(page.id, { title: v }); void cascadeMentionLabel(page.world_id, page.id, v); }
                setEditingTitle(false);
              }}
              style={{
                background: 'transparent',
                border: `1px solid ${colors.outlineVariant}44`,
                borderRadius: 6,
                padding: '2px 6px',
                color: colors.onSurface,
                fontSize: 28,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                fontWeight: 700,
                letterSpacing: -0.4,
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <div onDoubleClick={() => setEditingTitle(true)} style={{ cursor: 'default' }}>
              <Text variant="headline-md" family="serif-display" weight="bold" style={styles.title}>{page.title}</Text>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <InlinePagePicker label="Leader:" icon="person" value={leaderPage} candidates={leaderCandidates} onSelect={(id) => updateField('leader', id)} accentColor={colors.cosmic} worldId={worldId} />
            <InlinePagePicker label="HQ:" icon="place" value={hqPage} candidates={hqCandidates} onSelect={(id) => updateField('headquarters', id)} accentColor={colors.primary} worldId={worldId} />
          </div>
        </View>
      </View>

      {/* ── Property pills ── */}
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: spacing.lg, paddingRight: spacing.lg, paddingBottom: spacing.xs }}>
        {propertyPills.map((pill) => (
          <div key={pill.key} style={{ position: 'relative' }}>
            <Pressable onPress={() => setEditingPill(editingPill === pill.key ? null : pill.key)} style={[styles.pill, pill.color ? { borderColor: pill.color + '44' } : undefined, !pill.value && styles.pillEmpty]}>
              {pill.icon ? <Icon name={pill.icon as React.ComponentProps<typeof Icon>['name']} size={12} color={pill.color ?? colors.outline} /> : null}
              <Text style={[styles.pillLabel, pill.color ? { color: pill.color } : undefined]}>{pill.label}</Text>
              {pill.value ? <Text style={[styles.pillValue, pill.color ? { color: pill.color } : undefined]}>{pill.fieldType === 'text' ? pill.value : pill.value.charAt(0).toUpperCase() + pill.value.slice(1)}</Text> : null}
            </Pressable>
            {editingPill === pill.key ? <PillEditor pill={pill} onSelect={(v) => { updateField(pill.key, v); setEditingPill(null); }} onClose={() => setEditingPill(null)} /> : null}
          </div>
        ))}
      </div>
      </View>

      {confirmDelete ? (
        <View style={styles.deleteBanner}>
          <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>Delete this page? Recoverable for 30 days.</Text>
          <Pressable onPress={() => setConfirmDelete(false)} style={styles.deleteBannerBtn}><Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>Cancel</Text></Pressable>
          <Pressable onPress={handleDeletePage} style={[styles.deleteBannerBtn, { borderWidth: 1, borderColor: colors.hpDanger + '55' }]}>
            <Icon name="delete" size={14} color={colors.hpDanger} /><Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>Confirm</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Main area ── */}
      <View style={styles.mainWrap}>
        <View style={styles.editorCol}>
          {bannerLock && isWorldOwner ? <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}><EditLockBanner ownerUserId={bannerLock.ownerId} lockedSinceIso={bannerLock.since} onRetry={tryClaim} onForceUnlock={isWorldOwner ? async () => { await forceReleasePageEdit(page.id); updatePageInStore(page.id, { editing_user_id: null, editing_since: null }); void tryClaim(); } : undefined} /></View> : null}
          <View style={[{ flex: 1 }, readOnly ? styles.disabledEditor : undefined]} pointerEvents={readOnly ? 'none' : 'auto'}>
            <LoreCanvasEditor initialBlocks={(page.body as Record<string, unknown>)?.__canvas_blocks as CanvasBlock[] | null ?? null} onChange={handleCanvasChange} editable={!readOnly} mentionablePages={mentionablePages} getSectionLabel={sectionLabelById} onMentionClick={(targetId) => void flushAndNavigate(targetId)} />
          </View>
          {saveLabel ? <View style={styles.saveIndicator}><View style={[styles.saveDot, saveState === 'error' ? { backgroundColor: colors.hpDanger } : { backgroundColor: colors.hpHealthy }]} /><Text style={styles.saveText}>{saveLabel}</Text></View> : null}
        </View>

        {/* ── Right sidebar ── */}
        {!rightPanelOpen ? (
          <View style={sideStyles.rightPanelCollapsed}>
            <Pressable onPress={() => setRightPanelOpen(true)} style={sideStyles.rightPanelToggleBtn}><Icon name="chevron-left" size={14} color={colors.onSurfaceVariant} /></Pressable>
          </View>
        ) : (
          <View style={sideStyles.rightPanel}>
            <View style={sideStyles.rightPanelTopRow}>
              <Pressable onPress={() => setRightPanelOpen(false)} style={sideStyles.rightPanelToggleBtn}><Icon name="chevron-right" size={14} color={colors.outline} /></Pressable>
            </View>
            <View style={sideStyles.rightTabs}>
              <RightTabBtn label="On This Page" active={rightTab === 'on_this_page'} onPress={() => setRightTab('on_this_page')} />
              <RightTabBtn label="Sub-pages" active={rightTab === 'sub_pages'} onPress={() => setRightTab('sub_pages')} />
            </View>

            <ScrollView contentContainerStyle={sideStyles.rightBody}>
              {rightTab === 'on_this_page' ? (
                <>
                  {/* Members */}
                  <CollapsibleSideSection icon="person" title="MEMBERS" count={members.length || undefined}>
                    {members.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No NPCs have this faction assigned yet.</Text>
                    ) : (
                      members
                        .sort((a, b) => (a.id === leaderId ? -1 : b.id === leaderId ? 1 : 0))
                        .map((npc) => (
                          <Pressable key={npc.id} onPress={() => router.push(worldPageHref(worldId, npc.id))} style={sideStyles.mentionRow}>
                            <View style={[sideStyles.mentionDot, { backgroundColor: colors.hpDanger }]} />
                            <View style={{ flex: 1 }}>
                              <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{npc.title}</Text>
                              <Text style={sideStyles.mentionMeta}>{npc.id === leaderId ? 'LEADER' : 'NPC'}</Text>
                            </View>
                            <Icon name="chevron-right" size={12} color={colors.outline} />
                          </Pressable>
                        ))
                    )}
                  </CollapsibleSideSection>

                  {/* Mentioned on this page */}
                  <CollapsibleSideSection icon="alternate-email" title="MENTIONED ON THIS PAGE" count={mentionedPages.length || undefined}>
                    {mentionedPages.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No mentions yet.</Text>
                    ) : mentionedPages.map((mp) => {
                      const mi = MENTION_ICON[mp.page_kind] ?? MENTION_ICON.custom;
                      return (
                        <Pressable key={mp.id} onPress={() => router.push(worldPageHref(worldId, mp.id))} style={sideStyles.mentionRow}>
                          <View style={[sideStyles.mentionDot, { backgroundColor: mi.color }]} />
                          <View style={{ flex: 1 }}>
                            <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{mp.title}</Text>
                            <Text style={sideStyles.mentionMeta}>{(PAGE_KIND_LABEL[mp.page_kind] ?? 'Page').toUpperCase()}</Text>
                          </View>
                          <Icon name="chevron-right" size={12} color={colors.outline} />
                        </Pressable>
                      );
                    })}
                  </CollapsibleSideSection>

                  {/* Linked from */}
                  <CollapsibleSideSection icon="link" title="LINKED FROM" count={backlinksLoaded && backlinks.length > 0 ? backlinks.length : undefined}>
                    {backlinksLoaded && backlinks.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No backlinks yet.</Text>
                    ) : backlinks.map((bl) => (
                      <Pressable key={bl.id} onPress={() => router.push(worldPageHref(worldId, bl.id))} style={sideStyles.mentionRow}>
                        <View style={{ flex: 1 }}>
                          <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{bl.title}</Text>
                          <Text style={sideStyles.mentionMeta}>{(PAGE_KIND_LABEL[bl.page_kind] ?? 'Page').toUpperCase()}</Text>
                        </View>
                        <Icon name="chevron-right" size={12} color={colors.outline} />
                      </Pressable>
                    ))}
                  </CollapsibleSideSection>

                  {/* Seen in play */}
                  <CollapsibleSideSection icon="history" title="SEEN IN PLAY" count={seenLoaded && seenInPlay.length > 0 ? seenInPlay.length : undefined}>
                    {seenLoaded && seenInPlay.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No session references yet.</Text>
                    ) : seenInPlay.slice(0, 5).map((evt) => {
                      const ago = formatRelativeTime(evt.created_at);
                      const snippet = (evt.body_text ?? '').slice(0, 80);
                      return (
                        <View key={evt.id} style={sideStyles.seenRow}>
                          <View style={sideStyles.seenHeader}><View style={sideStyles.seenBadge}><Text style={sideStyles.seenBadgeText}>{evt.source_session_id ? 'S' : 'E'}</Text></View><Text style={sideStyles.seenAgo}>{ago}</Text></View>
                          <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 12 }}>{evt.title}</Text>
                          {snippet ? <Text variant="body-sm" numberOfLines={2} style={{ color: colors.onSurfaceVariant, fontSize: 11, marginTop: 2 }}>"{snippet}{(evt.body_text ?? '').length > 80 ? '…' : ''}"</Text> : null}
                        </View>
                      );
                    })}
                  </CollapsibleSideSection>

                  {/* Rivals & Allies */}
                  <CollapsibleSideSection icon="people" title="RIVALS & ALLIES" count={relationships.length || undefined}>
                    {relationships.map((rel, i) => {
                      const target = (allPages ?? []).find((p) => p.id === rel.targetPageId);
                      if (!target) return null;
                      const isNpc = target.page_kind === 'npc';
                      return (
                        <View key={`${rel.targetPageId}-${i}`} style={styles.relRow}>
                          <Pressable onPress={() => router.push(worldPageHref(worldId, rel.targetPageId))} style={styles.relLink}>
                            <View style={[sideStyles.mentionDot, { backgroundColor: isNpc ? colors.cosmic : colors.hpWarning }]} />
                            <View style={{ flex: 1 }}>
                              <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{target.title}</Text>
                              <Text style={sideStyles.mentionMeta}>{rel.type.toUpperCase()}{rel.note ? ` · ${rel.note}` : ''}</Text>
                            </View>
                            <Icon name="chevron-right" size={12} color={colors.outline} />
                          </Pressable>
                          <Pressable onPress={() => updateField('__relationships', relationships.filter((_, j) => j !== i))} style={{ padding: 4 }}>
                            <Icon name="close" size={12} color={colors.outline} />
                          </Pressable>
                        </View>
                      );
                    })}
                    <Pressable onPress={() => setAddingRelationship(true)} style={styles.addRelBtn}>
                      <Icon name="add" size={14} color={colors.outline} />
                      <Text style={{ fontFamily: 'Manrope', fontSize: 11, color: colors.outline }}>Add relationship</Text>
                    </Pressable>
                  </CollapsibleSideSection>

                  {/* Hooks & Rumors */}
                  <CollapsibleSideSection icon="lightbulb" title="HOOKS & RUMORS" count={hooks.length || undefined}>
                    {hooks.map((hook, i) => (
                      <View key={i} style={sideStyles.hookRow}>
                        <Text style={sideStyles.hookBullet}>•</Text>
                        <Text variant="body-sm" style={{ flex: 1, color: colors.onSurfaceVariant, fontSize: 12 }}>{hook}</Text>
                        <Pressable onPress={() => updateField('__hooks', hooks.filter((_, j) => j !== i))} style={{ padding: 2 }}><Icon name="close" size={12} color={colors.outline} /></Pressable>
                      </View>
                    ))}
                    <HookInput onAdd={(text) => updateField('__hooks', [...hooks, text])} />
                  </CollapsibleSideSection>
                </>
              ) : null}

              {rightTab === 'sub_pages' ? (
                subpages.length === 0 ? (
                  <Text variant="body-sm" style={sideStyles.emptyText}>No sub-pages yet.</Text>
                ) : subpages.map((p) => (
                  <Pressable key={p.id} onPress={() => router.push(worldPageHref(worldId, p.id))} style={sideStyles.mentionRow}>
                    <Icon name="shield" size={14} color={colors.hpWarning} />
                    <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>{p.title}</Text>
                    <Icon name="chevron-right" size={12} color={colors.outline} />
                  </Pressable>
                ))
              ) : null}
            </ScrollView>
          </View>
        )}
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
      {addingRelationship ? <AddFactionRelModal allPages={allPages ?? []} currentPageId={page.id} existingRelationships={relationships} onAdd={(rel) => { updateField('__relationships', [...relationships, rel]); setAddingRelationship(false); }} onClose={() => setAddingRelationship(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  rootSplit: { flex: 1, backgroundColor: colors.surfaceCanvas, minHeight: 0 },
  headerWrap: { height: 120, overflow: 'hidden' as const },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '22' },
  topBarLeft: { flexDirection: 'row', alignItems: 'center' },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  crumb: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.outline },
  crumbSep: { fontFamily: fonts.label, fontSize: 11, color: colors.outlineVariant, marginHorizontal: 6 },
  crumbActive: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.onSurfaceVariant, fontWeight: '600' },

  factionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.onSurface, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '44' },
  statChipLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.5, fontWeight: '600', color: colors.onSurfaceVariant },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '44' },
  pillEmpty: { borderStyle: 'dashed', opacity: 0.6 },
  pillLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.8, color: colors.outline },
  pillValue: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600', color: colors.onSurface, textTransform: 'capitalize' },

  mainWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },
  editorCol: { flex: 1, backgroundColor: colors.surfaceCanvas, position: 'relative' },
  disabledEditor: { opacity: 0.55 },
  saveIndicator: { position: 'absolute', top: 8, right: 16, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 11 },
  saveDot: { width: 6, height: 6, borderRadius: 3 },
  saveText: { fontFamily: fonts.label, fontSize: 11, color: colors.outline },

  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  deleteBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerContainer + '44', borderBottomWidth: 1, borderBottomColor: colors.hpDanger + '33' },
  deleteBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.lg },

  // HQ sidebar card
  hqCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineVariant + '33', overflow: 'hidden', backgroundColor: colors.surfaceContainerHigh },
  hqMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.outlineVariant + '22' },
  hqMetaLink: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.8, color: colors.primary, fontWeight: '600' },
  hqLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 10 },
  hqPlaceholder: { height: 80, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineVariant + '33', backgroundColor: colors.surfaceContainerHigh, alignItems: 'center', justifyContent: 'center' },

  // Relationships
  relRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  relLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.lg },
  addRelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineVariant + '33', borderStyle: 'dashed' },
});
