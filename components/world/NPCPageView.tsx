import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  cascadeMentionLabel,
  claimPageEdit,
  createWorldImage,
  forceReleasePageEdit,
  getMyStorageUsage,
  getPagesLinkingTo,
  getEventsReferencingPage,
  getWorldImageSignedUrlById,
  releasePageEdit,
  trashPage,
  updatePage,
  uploadWorldImage,
} from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
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
import { worldPageHref, worldSectionHref } from './worldHref';
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

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  worldId: string;
  splitMode?: boolean;
};

type RightTab = 'on_this_page' | 'sub_npcs';

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

const RELATIONSHIP_TYPES = [
  'ally', 'rival', 'enemy', 'friend', 'family', 'lover',
  'employer', 'servant', 'mentor', 'student', 'master', 'informant', 'other',
] as const;

type Relationship = { targetPageId: string; type: string; note?: string };

const RECIPROCAL_MAP: Record<string, string> = {
  ally: 'ally',
  rival: 'rival',
  enemy: 'enemy',
  friend: 'friend',
  family: 'family',
  lover: 'lover',
  employer: 'servant',
  servant: 'employer',
  mentor: 'student',
  student: 'mentor',
};

function getReciprocalType(type: string): string | null {
  return RECIPROCAL_MAP[type] ?? null;
}

function addReciprocalRelationship(
  targetPage: WorldPage,
  sourcePageId: string,
  reciprocalType: string,
) {
  const fields = (targetPage.structured_fields as Record<string, unknown>) ?? {};
  const existing: Relationship[] = Array.isArray(fields.__relationships)
    ? (fields.__relationships as Relationship[])
    : [];
  if (existing.some((r) => r.targetPageId === sourcePageId)) return;
  const next = { ...fields, __relationships: [...existing, { targetPageId: sourcePageId, type: reciprocalType }] };
  usePagesStore.getState().updatePage(targetPage.id, { structured_fields: next as Json });
  void updatePage(targetPage.id, { structured_fields: next as Json });
}

function removeReciprocalRelationship(
  targetPage: WorldPage,
  sourcePageId: string,
) {
  const fields = (targetPage.structured_fields as Record<string, unknown>) ?? {};
  const existing: Relationship[] = Array.isArray(fields.__relationships)
    ? (fields.__relationships as Relationship[])
    : [];
  const filtered = existing.filter((r) => r.targetPageId !== sourcePageId);
  if (filtered.length === existing.length) return;
  const next = { ...fields, __relationships: filtered };
  usePagesStore.getState().updatePage(targetPage.id, { structured_fields: next as Json });
  void updatePage(targetPage.id, { structured_fields: next as Json });
}

function AddRelationshipModal({ allPages, currentPageId, existingRelationships, onAdd, onClose }: {
  allPages: WorldPage[];
  currentPageId: string;
  existingRelationships: Relationship[];
  onAdd: (rel: Relationship) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [relType, setRelType] = useState<string>('ally');
  const [customType, setCustomType] = useState('');
  const [note, setNote] = useState('');

  const existingIds = new Set(existingRelationships.map((r) => r.targetPageId));
  const candidates = allPages
    .filter((p) => p.page_kind === 'npc' && p.id !== currentPageId && !existingIds.has(p.id))
    .filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase()));
  const selectedPage = selectedPageId ? allPages.find((p) => p.id === selectedPageId) : null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={relStyles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={relStyles.wrapper}>
          <View style={relStyles.card}>
            <View style={relStyles.header}>
              <Icon name="people" size={18} color={colors.cosmic} />
              <Text variant="title-md" family="serif-display" weight="semibold" style={{ color: colors.onSurface }}>
                Add Relationship
              </Text>
            </View>

            {!selectedPageId ? (
              <>
                <input
                  type="text"
                  value={search}
                  onChange={(e: any) => setSearch(e.target.value)}
                  autoFocus
                  placeholder="Search NPCs…"
                  style={{
                    width: '100%',
                    background: colors.surfaceContainerLowest,
                    border: `1px solid ${colors.outlineVariant}44`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    color: colors.onSurface,
                    fontSize: 13,
                    fontFamily: "'Manrope', system-ui, sans-serif",
                    outline: 'none',
                    marginBottom: 8,
                  }}
                />
                <ScrollView style={{ maxHeight: 240 }}>
                  {candidates.length === 0 ? (
                    <Text variant="body-sm" style={{ color: colors.outline, padding: 8, fontStyle: 'italic' }}>
                      {search ? 'No matching NPCs.' : 'No other NPCs in this world yet.'}
                    </Text>
                  ) : (
                    candidates.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => setSelectedPageId(p.id)}
                        style={relStyles.npcRow}
                      >
                        <Icon name="person" size={14} color={colors.cosmic} />
                        <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>{p.title}</Text>
                        <Icon name="chevron-right" size={12} color={colors.outline} />
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={relStyles.selectedRow}>
                  <Icon name="person" size={16} color={colors.cosmic} />
                  <Text variant="body-md" weight="semibold" style={{ flex: 1, color: colors.onSurface }}>{selectedPage?.title}</Text>
                  <Pressable onPress={() => setSelectedPageId(null)} style={{ padding: 4 }}>
                    <Icon name="close" size={14} color={colors.outline} />
                  </Pressable>
                </View>

                <Text variant="label-sm" uppercase style={{ color: colors.outline, letterSpacing: 1, marginTop: 12, marginBottom: 6 }}>
                  Relationship type
                </Text>
                <View style={relStyles.typeGrid}>
                  {RELATIONSHIP_TYPES.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => setRelType(t)}
                      style={[relStyles.typeChip, relType === t && relStyles.typeChipActive]}
                    >
                      <Text style={[relStyles.typeChipText, relType === t && { color: colors.primary }]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {relType === 'other' ? (
                  <input
                    type="text"
                    value={customType}
                    onChange={(e: any) => setCustomType(e.target.value)}
                    autoFocus
                    placeholder="Type a custom relationship…"
                    style={{
                      width: '100%',
                      background: colors.surfaceContainerLowest,
                      border: `1px solid ${colors.outlineVariant}44`,
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: colors.onSurface,
                      fontSize: 13,
                      fontFamily: "'Manrope', system-ui, sans-serif",
                      outline: 'none',
                      marginTop: 8,
                    }}
                  />
                ) : null}

                <input
                  type="text"
                  value={note}
                  onChange={(e: any) => setNote(e.target.value)}
                  placeholder="Optional note — e.g. 'owes a debt'"
                  style={{
                    width: '100%',
                    background: colors.surfaceContainerLowest,
                    border: `1px solid ${colors.outlineVariant}44`,
                    borderRadius: 8,
                    padding: '8px 12px',
                    color: colors.onSurface,
                    fontSize: 13,
                    fontFamily: "'Manrope', system-ui, sans-serif",
                    outline: 'none',
                    marginTop: 12,
                  }}
                />

                <View style={relStyles.actions}>
                  <Pressable onPress={onClose} style={relStyles.cancelBtn}>
                    <Text variant="label-md" style={{ color: colors.outline }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const finalType = relType === 'other' && customType.trim() ? customType.trim() : relType;
                      onAdd({ targetPageId: selectedPageId, type: finalType, note: note.trim() || undefined });
                    }}
                    style={relStyles.addBtn}
                  >
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  wrapper: { width: '100%', maxWidth: 380 },
  card: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  npcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.lg,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryContainer + '22',
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  typeChipActive: {
    borderColor: colors.primary + '55',
    backgroundColor: colors.primaryContainer + '22',
  },
  typeChipText: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.onSurfaceVariant,
    textTransform: 'capitalize',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.lg,
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primaryContainer + '22',
  },
});

const STATUS_COLOR: Record<string, string> = {
  alive: colors.hpHealthy,
  dead: colors.hpDanger,
  missing: colors.hpWarning,
  unknown: colors.outline,
};

const DISPOSITION_COLOR: Record<string, string> = {
  friendly: colors.hpHealthy,
  neutral: colors.outline,
  hostile: colors.hpDanger,
  unknown: colors.outline,
};

type CanvasBlock = { id: string; x: number; y: number; width: number; height?: number; html: string };

export function NPCPageView({ page, worldId, splitMode }: Props) {
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [editingTitle, setEditingTitle] = useState(false);
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

  const section = useMemo(
    () => sections.find((s) => s.id === page.section_id) ?? null,
    [sections, page],
  );

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

  const role = typeof fields.role === 'string' ? fields.role : '';
  const species = typeof fields.species === 'string' ? fields.species : '';
  const gender = typeof fields.gender === 'string' ? fields.gender : '';
  const status = typeof fields.status === 'string' ? fields.status : '';
  const disposition = typeof fields.disposition === 'string' ? fields.disposition : '';
  const hooks = Array.isArray(fields.__hooks) ? (fields.__hooks as string[]) : [];
  const voice = typeof fields.__voice === 'string' ? fields.__voice : '';
  const relationships: Relationship[] = Array.isArray(fields.__relationships) ? (fields.__relationships as Relationship[]) : [];
  const [editingVoice, setEditingVoice] = useState(false);
  const [addingRelationship, setAddingRelationship] = useState(false);

  // Portrait image
  const portraitImageId = typeof fields.__portrait_image_id === 'string' ? fields.__portrait_image_id : null;
  const portraitZoom = typeof fields.__portrait_zoom === 'number' ? fields.__portrait_zoom : 1;
  const portraitOffsetX = typeof fields.__portrait_offset_x === 'number' ? fields.__portrait_offset_x : 0;
  const portraitOffsetY = typeof fields.__portrait_offset_y === 'number' ? fields.__portrait_offset_y : 0;
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitUploading, setPortraitUploading] = useState(false);
  const portraitInputRef = useRef<HTMLInputElement | null>(null);
  const [adjustingPortrait, setAdjustingPortrait] = useState(false);
  const [localZoom, setLocalZoom] = useState(portraitZoom);
  const [localOffsetX, setLocalOffsetX] = useState(portraitOffsetX);
  const [localOffsetY, setLocalOffsetY] = useState(portraitOffsetY);

  useEffect(() => {
    setLocalZoom(portraitZoom);
    setLocalOffsetX(portraitOffsetX);
    setLocalOffsetY(portraitOffsetY);
  }, [portraitZoom, portraitOffsetX, portraitOffsetY]);

  useEffect(() => {
    if (!portraitImageId) { setPortraitUrl(null); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await getWorldImageSignedUrlById(portraitImageId);
      if (!cancelled && data) setPortraitUrl(data.signedUrl);
    })();
    return () => { cancelled = true; };
  }, [portraitImageId]);

  async function handlePortraitPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return;
    setPortraitUploading(true);
    try {
      const usage = await getMyStorageUsage();
      if (usage.blocked) { console.warn('Portrait: storage blocked'); setPortraitUploading(false); return; }

      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
        img.onerror = () => { reject(new Error('Bad image')); URL.revokeObjectURL(url); };
        img.src = url;
      });

      let { w, h } = dims;
      const MAX_DIM = 1920;
      let blob: Blob = file;
      let mimeType = file.type;
      if (w > MAX_DIM || h > MAX_DIM || file.type !== 'image/jpeg') {
        const ratio = (w > MAX_DIM || h > MAX_DIM)
          ? Math.min(MAX_DIM / w, MAX_DIM / h)
          : 1;
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
        blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('compress fail')), 'image/jpeg', 0.85));
        mimeType = 'image/jpeg';
      }

      const imageId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase().replace(/\.(png|webp)$/, '.jpg');
      const { error: upErr } = await uploadWorldImage({ worldId, imageId, filename, body: blob, contentType: mimeType });
      if (upErr) { console.error('Portrait storage upload failed:', upErr); setPortraitUploading(false); return; }

      const imageKey = `${worldId}/${imageId}/${filename}`;
      const { data: row, error: rowErr } = await createWorldImage({ world_id: worldId, page_id: page.id, image_key: imageKey, width: w, height: h, alt: page.title, byte_size: blob.size, content_type: mimeType });
      if (rowErr) { console.error('Portrait DB row failed:', rowErr); setPortraitUploading(false); return; }
      if (row) {
        updateFields({
          __portrait_image_id: row.id,
          __portrait_zoom: 1,
          __portrait_offset_x: 0,
          __portrait_offset_y: 0,
        });
      }
    } catch (err) { console.error('Portrait upload failed:', err); }
    setPortraitUploading(false);
    if (portraitInputRef.current) portraitInputRef.current.value = '';
  }

  function savePortraitCrop() {
    updateFields({
      __portrait_zoom: localZoom,
      __portrait_offset_x: localOffsetX,
      __portrait_offset_y: localOffsetY,
    });
    setAdjustingPortrait(false);
  }

  // Lock
  const [lockError, setLockError] = useState<{ ownerId: string; since: string } | null>(null);
  const lockOwnerId = page.editing_user_id ?? null;
  const lockSince = page.editing_since ?? null;
  const lockFresh = lockSince !== null && Date.now() - Date.parse(lockSince) < 90_000;
  const heldByOther = lockFresh && lockOwnerId !== null && myUserId !== null && lockOwnerId !== myUserId;
  const bannerLock = heldByOther
    ? { ownerId: lockOwnerId as string, since: lockSince as string }
    : lockError;
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
      if (isLockConflict && ctx.lockOwnerId && ctx.lockOwnerId !== ctx.myUserId && ctx.lockSince) {
        setLockError({ ownerId: ctx.lockOwnerId, since: ctx.lockSince });
      } else if (isLockConflict) {
        setLockError({ ownerId: ctx.lockOwnerId ?? 'unknown', since: ctx.lockSince ?? new Date().toISOString() });
      }
      return;
    }
    if (data) {
      ctx.updatePageInStore(data.id, { editing_user_id: data.editing_user_id, editing_since: data.editing_since });
      setLockError(null);
    }
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

  const mentionablePages = useMemo(
    () => (allPages ?? []).filter((p) => p.id !== page.id),
    [allPages, page.id],
  );

  const sectionLabelById = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  );

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
      const { data, error } = await updatePage(page.id, {
        body: pending.body as Json,
        body_text: pending.bodyText,
        body_refs: pending.bodyRefs,
      });
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
  const subpages = useMemo(
    () => (allPages ?? [])
      .filter((p) => p.parent_page_id === page.id)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order),
    [allPages, page.id],
  );

  const [backlinks, setBacklinks] = useState<WorldPage[]>([]);
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setBacklinksLoaded(false);
    void (async () => {
      const { data } = await getPagesLinkingTo(worldId, page.id);
      if (!cancelled) { setBacklinks(data ?? []); setBacklinksLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [page.id, worldId]);

  // Seen in play — timeline events referencing this NPC
  const [seenInPlay, setSeenInPlay] = useState<TimelineEvent[]>([]);
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSeenLoaded(false);
    void (async () => {
      const { data } = await getEventsReferencingPage(worldId, page.id);
      if (!cancelled) { setSeenInPlay((data ?? []) as TimelineEvent[]); setSeenLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [page.id, worldId]);

  // Mentioned on this page (pages referenced in body_refs)
  const mentionedPages = useMemo(() => {
    const refs = page.body_refs ?? [];
    if (refs.length === 0) return [];
    const pages = allPages ?? [];
    return refs.map((id) => pages.find((p) => p.id === id)).filter((p): p is WorldPage => !!p);
  }, [page.body_refs, allPages]);

  // Locations that reference this NPC (inverse of Location's "NPCs Here")
  const npcLocations = useMemo(() => {
    const pages = allPages ?? [];
    return pages.filter(
      (p) => p.page_kind === 'location' && (p.body_refs ?? []).includes(page.id),
    );
  }, [allPages, page.id]);

  // Property pills
  const STATUS_OPTIONS = ['alive', 'dead', 'missing', 'unknown'];
  const DISPOSITION_OPTIONS = ['friendly', 'neutral', 'hostile', 'unknown'];
  const GENDER_OPTIONS = ['male', 'female', 'unknown', 'other'];

  const propertyPills: PillDef[] = [
    { key: 'role', label: 'ROLE', value: role, icon: 'badge', fieldType: 'text' },
    { key: 'species', label: 'SPECIES', value: species, icon: 'pets', fieldType: 'text' },
    { key: 'gender', label: 'GENDER', value: gender, fieldType: 'select', options: GENDER_OPTIONS },
    { key: 'status', label: 'STATUS', value: status, icon: 'favorite', fieldType: 'select', options: STATUS_OPTIONS, color: status ? STATUS_COLOR[status] : undefined },
    { key: 'disposition', label: 'DISPOSITION', value: disposition, icon: 'mood', fieldType: 'select', options: DISPOSITION_OPTIONS, color: disposition ? DISPOSITION_COLOR[disposition] : undefined },
  ];

  const saveLabel = saveState === 'saving' ? 'Saving…' :
    saveState === 'saved' ? 'Saved · just now' :
    saveState === 'error' ? 'Save failed' : '';

  return (
    <View style={splitMode ? styles.rootSplit : styles.root}>
      {!splitMode ? (
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={{ marginRight: 6 }}>
            <Icon name="person" size={18} color={colors.cosmic} />
          </View>
          <Pressable onPress={() => router.push(worldSectionHref(worldId, page.section_id))}>
            <Text style={styles.crumb}>{section?.name?.toUpperCase() ?? 'NPCS'}</Text>
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

      {/* ── Portrait + Title + pills (fixed height for cross-template alignment) ── */}
      <View style={styles.headerWrap}>
      <View style={styles.npcHead}>
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => portraitUrl ? setAdjustingPortrait(true) : portraitInputRef.current?.click()}
            style={{ width: 72, height: 72, borderRadius: 36, overflow: 'hidden', cursor: 'pointer' }}
          >
            {portraitUrl ? (
              <div style={{
                width: 72, height: 72, borderRadius: 36, overflow: 'hidden', position: 'relative',
              }}>
                <img
                  src={portraitUrl}
                  alt={page.title}
                  style={{
                    position: 'absolute',
                    width: `${100 * localZoom}%`,
                    height: `${100 * localZoom}%`,
                    objectFit: 'contain',
                    left: `${50 + localOffsetX}%`,
                    top: `${50 + localOffsetY}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              </div>
            ) : (
              <LinearGradient
                colors={[colors.cosmicContainer, colors.surfaceContainerLowest]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.portraitFallback}
              >
                {portraitUploading ? (
                  <Text style={styles.portraitInitials}>…</Text>
                ) : (
                  <>
                    <Text style={styles.portraitInitials}>{getInitials(page.title)}</Text>
                    <View style={styles.portraitUploadHint}>
                      <Icon name="camera-alt" size={12} color={colors.outline} />
                    </View>
                  </>
                )}
              </LinearGradient>
            )}
          </div>
          <input
            ref={portraitInputRef as any}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePortraitPick as any}
            style={{ display: 'none' }}
          />

        </div>

        <View style={styles.npcTitleCol}>
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
                border: `1px solid ${colors.primary}66`,
                borderRadius: 6,
                color: colors.onSurface,
                fontFamily: "'Fraunces_700Bold', 'Fraunces', Georgia, serif",
                fontSize: 22,
                fontWeight: 700,
                outline: 'none',
                padding: '2px 6px',
                width: '100%',
              }}
            />
          ) : (
            <div onDoubleClick={() => setEditingTitle(true)} style={{ cursor: 'default' }}>
              <Text variant="headline-md" family="serif-display" weight="bold" style={styles.npcName}>
                {page.title}
              </Text>
            </div>
          )}

          {/* Voice / personality cue */}
          {editingVoice ? (
            <div style={{ marginTop: 4, maxWidth: 400 }}>
              <input
                type="text"
                defaultValue={voice}
                autoFocus
                placeholder="e.g. 'Speaks in third person, raspy whisper'"
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter') { updateField('__voice', e.target.value.trim()); setEditingVoice(false); }
                  if (e.key === 'Escape') setEditingVoice(false);
                }}
                onBlur={(e: any) => { updateField('__voice', e.target.value.trim()); setEditingVoice(false); }}
                style={{
                  width: '100%',
                  background: colors.surfaceContainerHigh,
                  border: `1px solid ${colors.outlineVariant}44`,
                  borderRadius: 6,
                  padding: '4px 8px',
                  color: colors.onSurfaceVariant,
                  fontSize: 12,
                  fontFamily: "'Manrope', system-ui, sans-serif",
                  fontStyle: 'italic',
                  outline: 'none',
                }}
              />
            </div>
          ) : voice ? (
            <Pressable onPress={() => setEditingVoice(true)} style={styles.voiceCue}>
              <Icon name="record-voice-over" size={12} color={colors.outline} />
              <Text variant="body-sm" style={styles.voiceText} numberOfLines={1}>"{voice}"</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => setEditingVoice(true)} style={styles.voiceCueEmpty}>
              <Icon name="record-voice-over" size={12} color={colors.outline} />
              <Text style={{ fontFamily: 'Manrope', fontSize: 11, color: colors.outline }}>Add voice cue…</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Property pills (editable) ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        paddingLeft: spacing.lg,
        paddingRight: spacing.lg,
        paddingBottom: spacing.xs,
      }}>
        {propertyPills.map((pill) => (
          <div key={pill.key} style={{ position: 'relative' }}>
            <Pressable
              onPress={() => setEditingPill(editingPill === pill.key ? null : pill.key)}
              style={[
                styles.pill,
                pill.color ? { borderColor: pill.color + '44' } : undefined,
                !pill.value && styles.pillEmpty,
              ]}
            >
              {pill.icon ? (
                <Icon
                  name={pill.icon as React.ComponentProps<typeof Icon>['name']}
                  size={12}
                  color={pill.color ?? colors.outline}
                />
              ) : null}
              <Text style={[styles.pillLabel, pill.color ? { color: pill.color } : undefined]}>
                {pill.label}
              </Text>
              {pill.value ? (
                <Text style={[styles.pillValue, pill.color ? { color: pill.color } : undefined]}>
                  {pill.value.charAt(0).toUpperCase() + pill.value.slice(1)}
                </Text>
              ) : null}
            </Pressable>
            {editingPill === pill.key ? (
              <PillEditor
                pill={pill}
                onSelect={(v) => { updateField(pill.key, v); setEditingPill(null); }}
                onClose={() => setEditingPill(null)}
              />
            ) : null}
          </div>
        ))}
      </div>
      </View>

      {confirmDelete ? (
        <View style={styles.deleteBanner}>
          <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>
            Delete this page? Recoverable for 30 days.
          </Text>
          <Pressable onPress={() => setConfirmDelete(false)} style={styles.deleteBannerBtn}>
            <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleDeletePage} style={[styles.deleteBannerBtn, { borderWidth: 1, borderColor: colors.hpDanger + '55' }]}>
            <Icon name="delete" size={14} color={colors.hpDanger} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>Confirm</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Main area: canvas editor + right sidebar ── */}
      <View style={styles.mainWrap}>
        <View style={styles.editorCol}>
          {bannerLock && isWorldOwner ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
              <EditLockBanner ownerUserId={bannerLock.ownerId} lockedSinceIso={bannerLock.since} onRetry={tryClaim} onForceUnlock={isWorldOwner ? async () => { await forceReleasePageEdit(page.id); updatePageInStore(page.id, { editing_user_id: null, editing_since: null }); void tryClaim(); } : undefined} />
            </View>
          ) : null}

          <View
            style={[{ flex: 1 }, readOnly ? styles.disabledEditor : undefined]}
            pointerEvents={readOnly ? 'none' : 'auto'}
          >
            <LoreCanvasEditor
              initialBlocks={
                (page.body as Record<string, unknown>)?.__canvas_blocks as CanvasBlock[] | null ?? null
              }
              onChange={handleCanvasChange}
              editable={!readOnly}
              mentionablePages={mentionablePages}
              getSectionLabel={sectionLabelById}
              onMentionClick={(targetId) => void flushAndNavigate(targetId)}
            />
          </View>

          {saveLabel ? (
            <View style={styles.saveIndicator}>
              <View style={[styles.saveDot, saveState === 'error' ? { backgroundColor: colors.hpDanger } : { backgroundColor: colors.hpHealthy }]} />
              <Text style={styles.saveText}>{saveLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Right sidebar ── */}
        {!rightPanelOpen ? (
          <View style={sideStyles.rightPanelCollapsed}>
            <Pressable
              onPress={() => setRightPanelOpen(true)}
              style={sideStyles.rightPanelToggleBtn}
              accessibilityLabel="Show sidebar"
            >
              <Icon name="chevron-left" size={14} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
        ) : (
          <View style={sideStyles.rightPanel}>
            <View style={sideStyles.rightPanelTopRow}>
              <Pressable
                onPress={() => setRightPanelOpen(false)}
                style={sideStyles.rightPanelToggleBtn}
                accessibilityLabel="Collapse sidebar"
              >
                <Icon name="chevron-right" size={14} color={colors.outline} />
              </Pressable>
            </View>
            <View style={sideStyles.rightTabs}>
              <RightTabBtn label="On This Page" active={rightTab === 'on_this_page'} onPress={() => setRightTab('on_this_page')} />
              <RightTabBtn label="Sub-pages" active={rightTab === 'sub_npcs'} onPress={() => setRightTab('sub_npcs')} />
            </View>

            <ScrollView contentContainerStyle={sideStyles.rightBody}>
              {rightTab === 'on_this_page' ? (
                <>
                  {/* Mentioned on this page */}
                  <CollapsibleSideSection icon="alternate-email" title="MENTIONED ON THIS PAGE" count={mentionedPages.length || undefined}>
                    {mentionedPages.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No mentions yet.</Text>
                    ) : (
                      mentionedPages.map((mp) => {
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
                      })
                    )}
                  </CollapsibleSideSection>

                  {/* Locations — places that reference this NPC */}
                  <CollapsibleSideSection icon="place" title="LOCATIONS" count={npcLocations.length || undefined}>
                    {npcLocations.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No locations linked yet.</Text>
                    ) : (
                      npcLocations.map((loc) => (
                        <Pressable key={loc.id} onPress={() => router.push(worldPageHref(worldId, loc.id))} style={sideStyles.mentionRow}>
                          <View style={[sideStyles.mentionDot, { backgroundColor: colors.primary }]} />
                          <View style={{ flex: 1 }}>
                            <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{loc.title}</Text>
                            <Text style={sideStyles.mentionMeta}>LOCATION</Text>
                          </View>
                          <Icon name="chevron-right" size={12} color={colors.outline} />
                        </Pressable>
                      ))
                    )}
                  </CollapsibleSideSection>

                  {/* Linked from */}
                  <CollapsibleSideSection icon="link" title="LINKED FROM" count={backlinksLoaded && backlinks.length > 0 ? backlinks.length : undefined}>
                    {backlinksLoaded && backlinks.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No backlinks yet.</Text>
                    ) : (
                      backlinks.map((bl) => (
                        <Pressable key={bl.id} onPress={() => router.push(worldPageHref(worldId, bl.id))} style={sideStyles.mentionRow}>
                          <View style={{ flex: 1 }}>
                            <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{bl.title}</Text>
                            <Text style={sideStyles.mentionMeta}>{(PAGE_KIND_LABEL[bl.page_kind] ?? 'Page').toUpperCase()}</Text>
                          </View>
                          <Icon name="chevron-right" size={12} color={colors.outline} />
                        </Pressable>
                      ))
                    )}
                  </CollapsibleSideSection>

                  {/* Seen in play */}
                  <CollapsibleSideSection icon="history" title="SEEN IN PLAY" count={seenLoaded && seenInPlay.length > 0 ? seenInPlay.length : undefined}>
                    {seenLoaded && seenInPlay.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No session references yet.</Text>
                    ) : (
                      seenInPlay.slice(0, 5).map((evt) => {
                        const ago = formatRelativeTime(evt.created_at);
                        const snippet = (evt.body_text ?? '').slice(0, 80);
                        return (
                          <View key={evt.id} style={sideStyles.seenRow}>
                            <View style={sideStyles.seenHeader}>
                              <View style={sideStyles.seenBadge}>
                                <Text style={sideStyles.seenBadgeText}>
                                  {evt.source_session_id ? 'S' : 'E'}
                                </Text>
                              </View>
                              <Text style={sideStyles.seenAgo}>{ago}</Text>
                            </View>
                            <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 12 }}>
                              {evt.title}
                            </Text>
                            {snippet ? (
                              <Text variant="body-sm" numberOfLines={2} style={{ color: colors.onSurfaceVariant, fontSize: 11, marginTop: 2 }}>
                                "{snippet}{(evt.body_text ?? '').length > 80 ? '…' : ''}"
                              </Text>
                            ) : null}
                          </View>
                        );
                      })
                    )}
                  </CollapsibleSideSection>

                  {/* Relationships */}
                  <CollapsibleSideSection icon="people" title="RELATIONSHIPS" count={relationships.length || undefined}>
                    {relationships.map((rel, i) => {
                      const targetPage = (allPages ?? []).find((p) => p.id === rel.targetPageId);
                      if (!targetPage) return null;
                      return (
                        <View key={`${rel.targetPageId}-${i}`} style={styles.relRow}>
                          <Pressable
                            onPress={() => router.push(worldPageHref(worldId, rel.targetPageId))}
                            style={styles.relLink}
                          >
                            <View style={[sideStyles.mentionDot, { backgroundColor: colors.cosmic }]} />
                            <View style={{ flex: 1 }}>
                              <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{targetPage.title}</Text>
                              <Text style={sideStyles.mentionMeta}>{rel.type.toUpperCase()}{rel.note ? ` · ${rel.note}` : ''}</Text>
                            </View>
                            <Icon name="chevron-right" size={12} color={colors.outline} />
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              updateField('__relationships', relationships.filter((_, j) => j !== i));
                              if (targetPage) removeReciprocalRelationship(targetPage, page.id);
                            }}
                            style={{ padding: 4 }}
                          >
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
                        <Pressable
                          onPress={() => updateField('__hooks', hooks.filter((_, j) => j !== i))}
                          style={{ padding: 2 }}
                        >
                          <Icon name="close" size={12} color={colors.outline} />
                        </Pressable>
                      </View>
                    ))}
                    <HookInput onAdd={(text) => updateField('__hooks', [...hooks, text])} />
                  </CollapsibleSideSection>
                </>
              ) : null}

              {rightTab === 'sub_npcs' ? (
                subpages.length === 0 ? (
                  <Text variant="body-sm" style={sideStyles.emptyText}>No sub-pages yet.</Text>
                ) : (
                  subpages.map((p) => (
                    <Pressable key={p.id} onPress={() => router.push(worldPageHref(worldId, p.id))} style={sideStyles.mentionRow}>
                      <Icon name="person" size={14} color={colors.cosmic} />
                      <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>{p.title}</Text>
                      <Icon name="chevron-right" size={12} color={colors.outline} />
                    </Pressable>
                  ))
                )
              ) : null}
            </ScrollView>
          </View>
        )}
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}

      {addingRelationship ? <AddRelationshipModal
        allPages={allPages ?? []}
        currentPageId={page.id}
        existingRelationships={relationships}
        onAdd={(rel) => {
          updateField('__relationships', [...relationships, rel]);
          const reciprocal = getReciprocalType(rel.type);
          if (reciprocal) {
            const target = (allPages ?? []).find((p) => p.id === rel.targetPageId);
            if (target) addReciprocalRelationship(target, page.id, reciprocal);
          }
          setAddingRelationship(false);
        }}
        onClose={() => setAddingRelationship(false)}
      /> : null}

      {adjustingPortrait && portraitUrl ? createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => { setAdjustingPortrait(false); setLocalZoom(portraitZoom); setLocalOffsetX(portraitOffsetX); setLocalOffsetY(portraitOffsetY); }}
          />
          <div style={{
            position: 'fixed',
            top: 120,
            left: 80,
            zIndex: 9001,
            background: colors.surfaceContainerHigh,
            border: `1px solid ${colors.outlineVariant}55`,
            borderRadius: 12,
            padding: 20,
            width: 280,
            boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{
              width: 200, height: 200, borderRadius: 100, overflow: 'hidden',
              margin: '0 auto 16px', position: 'relative',
              border: `2px solid ${colors.outlineVariant}44`,
            }}>
              <img
                src={portraitUrl}
                alt={page.title}
                draggable={false}
                style={{
                  position: 'absolute',
                  width: `${100 * localZoom}%`,
                  height: `${100 * localZoom}%`,
                  objectFit: 'contain',
                  left: `${50 + localOffsetX}%`,
                  top: `${50 + localOffsetY}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'grab',
                }}
                onMouseDown={(e: any) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const startOx = localOffsetX;
                  const startOy = localOffsetY;
                  const onMove = (ev: MouseEvent) => {
                    const dx = ((ev.clientX - startX) / 200) * 100;
                    const dy = ((ev.clientY - startY) / 200) * 100;
                    setLocalOffsetX(Math.max(-50, Math.min(50, startOx + dx)));
                    setLocalOffsetY(Math.max(-50, Math.min(50, startOy + dy)));
                  };
                  const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontFamily: 'Manrope, system-ui', fontSize: 11, color: colors.outline, minWidth: 36 }}>Zoom</span>
              <input
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={localZoom}
                onChange={(e: any) => setLocalZoom(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: colors.primary }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => portraitInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 10px', borderRadius: 8,
                  border: `1px solid ${colors.outlineVariant}44`,
                  background: 'transparent', color: colors.outline,
                  fontFamily: 'Manrope, system-ui', fontSize: 11, cursor: 'pointer',
                }}
              >Replace</button>
              <button
                onClick={() => { setAdjustingPortrait(false); setLocalZoom(portraitZoom); setLocalOffsetX(portraitOffsetX); setLocalOffsetY(portraitOffsetY); }}
                style={{
                  padding: '5px 10px', borderRadius: 8,
                  border: `1px solid ${colors.outlineVariant}44`,
                  background: 'transparent', color: colors.outline,
                  fontFamily: 'Manrope, system-ui', fontSize: 11, cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={savePortraitCrop}
                style={{
                  padding: '5px 10px', borderRadius: 8,
                  border: `1px solid ${colors.primary}55`,
                  background: colors.primaryContainer + '22', color: colors.primary,
                  fontFamily: 'Manrope, system-ui', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >Save</button>
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  rootSplit: { flex: 1, backgroundColor: colors.surfaceCanvas, minHeight: 0 },
  headerWrap: { height: 120, overflow: 'hidden' as const },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center' },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  crumb: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.outline },
  crumbSep: { fontFamily: fonts.label, fontSize: 11, color: colors.outlineVariant, marginHorizontal: 6 },
  crumbActive: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.onSurfaceVariant, fontWeight: '600' },

  // NPC head — portrait + title
  npcHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  portrait: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
  },
  portraitFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.outlineVariant + '44',
  },
  portraitInitials: {
    fontFamily: fonts.headline,
    fontSize: 24,
    fontWeight: '700',
    color: colors.onSurface,
    letterSpacing: 1,
  },
  portraitUploadHint: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  npcTitleCol: { flex: 1, gap: 2 },
  npcName: {
    color: colors.onSurface,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  npcSubtitle: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    fontSize: 14,
  },
  npcStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  npcStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  npcStatChipLabel: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Property pills
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  pillEmpty: {
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  pillLabel: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.outline,
  },
  pillValue: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
    color: colors.onSurface,
    textTransform: 'capitalize',
  },

  // Main area
  mainWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },
  editorCol: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
    position: 'relative',
  },
  disabledEditor: { opacity: 0.55 },

  saveIndicator: {
    position: 'absolute',
    top: 8,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 11,
  },
  saveDot: { width: 6, height: 6, borderRadius: 3 },
  saveText: { fontFamily: fonts.label, fontSize: 11, color: colors.outline },

  // Actions
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  deleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.dangerContainer + '44',
    borderBottomWidth: 1,
    borderBottomColor: colors.hpDanger + '33',
  },
  deleteBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },

  // Voice cue
  voiceCue: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
    backgroundColor: colors.surfaceContainerHigh + '44',
    maxWidth: 400,
  },
  voiceText: {
    fontStyle: 'italic',
    color: colors.onSurfaceVariant,
    fontSize: 12,
  },
  voiceCueEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderStyle: 'dashed',
    opacity: 0.6,
  },

  // Relationships
  relRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  relLink: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.lg,
  },
  addRelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    borderStyle: 'dashed',
  },
});
