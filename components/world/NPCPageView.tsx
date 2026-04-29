import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  createWorldImage,
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
};

type RightTab = 'on_this_page' | 'sub_npcs';

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

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

export function NPCPageView({ page, worldId }: Props) {
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
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
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
      if (usage.blocked) { setPortraitUploading(false); return; }

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
      if (w > MAX_DIM || h > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();
        blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error('compress fail')), 'image/jpeg', 0.85));
      }

      const imageId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
      const { error: upErr } = await uploadWorldImage({ worldId, imageId, filename, body: blob, contentType: 'image/jpeg' });
      if (upErr) { setPortraitUploading(false); return; }

      const imageKey = `${worldId}/${imageId}/${filename}`;
      const { data: row } = await createWorldImage({ world_id: worldId, page_id: page.id, image_key: imageKey, width: w, height: h, alt: page.title, byte_size: blob.size, content_type: 'image/jpeg' });
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

  const lockCtxRef = useRef({ lockOwnerId, lockSince, myUserId, updatePageInStore });
  lockCtxRef.current = { lockOwnerId, lockSince, myUserId, updatePageInStore };

  const tryClaim = useCallback(async () => {
    if (!page.id) return;
    const { data, error } = await claimPageEdit(page.id);
    const ctx = lockCtxRef.current;
    if (error) {
      if (ctx.lockOwnerId && ctx.lockOwnerId !== ctx.myUserId && ctx.lockSince) {
        setLockError({ ownerId: ctx.lockOwnerId, since: ctx.lockSince });
      } else {
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
      if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
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
    <View style={styles.root}>
      {/* ── Top bar: breadcrumbs + actions ── */}
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
          {isWorldOwner ? (
            <Pressable onPress={() => setShareOpen(true)} style={styles.shareBtn}>
              <Icon name="share" size={14} color={colors.onSurfaceVariant} />
              <Text variant="label-md" uppercase weight="semibold" style={{ color: colors.onSurfaceVariant, letterSpacing: 1, fontSize: 11 }}>Share</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Portrait + Title row ── */}
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
                    objectFit: 'cover',
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

          {/* Adjust portrait overlay */}
          {adjustingPortrait ? (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)' }} onClick={() => setAdjustingPortrait(false)} />
              <div style={{
                position: 'absolute',
                top: 80,
                left: 0,
                zIndex: 201,
                background: colors.surfaceContainerHigh,
                border: `1px solid ${colors.outlineVariant}55`,
                borderRadius: 12,
                padding: 16,
                minWidth: 220,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                <div style={{
                  width: 180, height: 180, borderRadius: 90, overflow: 'hidden',
                  margin: '0 auto 12px', position: 'relative',
                  border: `2px solid ${colors.outlineVariant}44`,
                }}>
                  <img
                    src={portraitUrl!}
                    alt={page.title}
                    draggable={false}
                    style={{
                      position: 'absolute',
                      width: `${100 * localZoom}%`,
                      height: `${100 * localZoom}%`,
                      objectFit: 'cover',
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
                        const dx = ((ev.clientX - startX) / 180) * 100;
                        const dy = ((ev.clientY - startY) / 180) * 100;
                        setLocalOffsetX(Math.max(-50, Math.min(50, startOx + dx)));
                        setLocalOffsetY(Math.max(-50, Math.min(50, startOy + dy)));
                      };
                      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                      document.addEventListener('mousemove', onMove);
                      document.addEventListener('mouseup', onUp);
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={{ fontFamily: 'Manrope', fontSize: 11, color: colors.outline, minWidth: 36 }}>Zoom</Text>
                  <input
                    type="range"
                    min="1"
                    max="4"
                    step="0.1"
                    value={localZoom}
                    onChange={(e: any) => setLocalZoom(parseFloat(e.target.value))}
                    style={{ flex: 1 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Pressable onPress={() => portraitInputRef.current?.click()} style={styles.portraitActionBtn}>
                    <Icon name="cloud-upload" size={14} color={colors.outline} />
                    <Text style={{ fontFamily: 'Manrope', fontSize: 11, color: colors.outline }}>Replace</Text>
                  </Pressable>
                  <Pressable onPress={() => { setAdjustingPortrait(false); setLocalZoom(portraitZoom); setLocalOffsetX(portraitOffsetX); setLocalOffsetY(portraitOffsetY); }} style={styles.portraitActionBtn}>
                    <Text style={{ fontFamily: 'Manrope', fontSize: 11, color: colors.outline }}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={savePortraitCrop} style={[styles.portraitActionBtn, { borderColor: colors.primary + '55', backgroundColor: colors.primaryContainer + '22' }]}>
                    <Text style={{ fontFamily: 'Manrope', fontSize: 11, color: colors.primary, fontWeight: '600' }}>Save</Text>
                  </Pressable>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <View style={styles.npcTitleCol}>
          <Text variant="headline-md" family="serif-display" weight="bold" style={styles.npcName}>
            {page.title}
          </Text>
          {role ? (
            <Text variant="body-md" family="serif-body" style={styles.npcSubtitle}>
              {role}{species ? ` · ${species}` : ''}
            </Text>
          ) : species ? (
            <Text variant="body-md" family="serif-body" style={styles.npcSubtitle}>
              {species}
            </Text>
          ) : null}
          <View style={styles.npcStatRow}>
            {status ? (
              <View style={[styles.npcStatChip, { borderColor: (STATUS_COLOR[status] ?? colors.outline) + '44' }]}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] ?? colors.outline }]} />
                <Text style={[styles.npcStatChipLabel, { color: STATUS_COLOR[status] ?? colors.outline }]}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </View>
            ) : null}
            {disposition ? (
              <View style={[styles.npcStatChip, { borderColor: (DISPOSITION_COLOR[disposition] ?? colors.outline) + '44' }]}>
                <Text style={[styles.npcStatChipLabel, { color: DISPOSITION_COLOR[disposition] ?? colors.outline }]}>
                  {disposition.charAt(0).toUpperCase() + disposition.slice(1)}
                </Text>
              </View>
            ) : null}
            <VisibilityBadge
              visibility={page.visible_to_players ? 'player' : 'gm'}
              interactive={!!toggleVisibility}
              onPress={toggleVisibility ?? undefined}
            />
          </View>
        </View>
      </View>

      {/* ── Property pills ── */}
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
          {bannerLock ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
              <EditLockBanner ownerUserId={bannerLock.ownerId} lockedSinceIso={bannerLock.since} onRetry={tryClaim} />
            </View>
          ) : null}

          <View
            style={[{ flex: 1 }, heldByOther ? styles.disabledEditor : undefined]}
            pointerEvents={heldByOther ? 'none' : 'auto'}
          >
            <LoreCanvasEditor
              initialBlocks={
                (page.body as Record<string, unknown>)?.__canvas_blocks as CanvasBlock[] | null ?? null
              }
              onChange={handleCanvasChange}
              editable={!heldByOther}
              mentionablePages={mentionablePages}
              getSectionLabel={sectionLabelById}
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
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="alternate-email" title="MENTIONED ON THIS PAGE" count={mentionedPages.length || undefined} />
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
                  </View>

                  {/* Locations — places that reference this NPC */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="place" title="LOCATIONS" count={npcLocations.length || undefined} />
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
                  </View>

                  {/* Linked from */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="link" title="LINKED FROM" count={backlinksLoaded && backlinks.length > 0 ? backlinks.length : undefined} />
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
                  </View>

                  {/* Seen in play */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="history" title="SEEN IN PLAY" count={seenLoaded && seenInPlay.length > 0 ? seenInPlay.length : undefined} />
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
                  </View>

                  {/* Hooks & Rumors */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="lightbulb" title="HOOKS & RUMORS" count={hooks.length || undefined} />
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
                  </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },

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
  portraitActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.lg,
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
});
