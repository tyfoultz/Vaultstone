import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  cascadeMentionLabel,
  claimPageEdit,
  forceReleasePageEdit,
  getEventsForTimeline,
  getMyPagePermission,
  listMaps,
  listPinsForWorld,
  listPinTypes,
  releasePageEdit,
  supabase,
  trashPage,
  updatePage,
  type MapPin,
  type PinType,
  type WorldMap,
} from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import {
  selectSectionsForWorld,
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import {
  Icon,
  MetaLabel,
  Text,
  VisibilityBadge,
  colors,
  radius,
  spacing,
  useBreakpoint,
} from '@vaultstone/ui';
import type { Json, TemplateKey, WorldPage } from '@vaultstone/types';

import { useActiveSection } from './ActiveSectionContext';
import { BodyEditor } from './BodyEditor';
import type { MentionPinItem, MentionEventItem } from './MentionSuggestion.web';
import { EditLockBanner } from './EditLockBanner';
import { PageHead } from './PageHead';
import { OrphanBanner } from './OrphanBanner';
import { PlayerViewToggle } from './PlayerViewToggle';
import { FactsModal } from './FactsModal';
import { LoreCanvasEditor } from './LoreCanvasEditor';
import { ShareModal } from './ShareModal';
import { StructuredFieldsForm } from './StructuredFieldsForm';
import { FactionPageView } from './FactionPageView';
import { LocationPageView } from './LocationPageView';
import { NPCPageView } from './NPCPageView';
import { TimelinePageView } from './TimelinePageView';
import { PCStubPageView } from './players/PCStubPageView';
import { SplitPaneTitle } from './SplitPaneTitle';
import { WikiRightPanel } from './WikiRightPanel';
import { WorldTopBar } from './WorldTopBar';
import { PAGE_KIND_LABEL } from './helpers';
import { usePageVisibilityToggle } from './usePageVisibilityToggle';
import { worldHref, worldMapHref, worldPageHref, worldSectionHref } from './worldHref';

const LOCK_HEARTBEAT_MS = 30_000;

const EMPTY_PAGES: WorldPage[] = [];
const EMPTY_MENTION_EVENTS: MentionEventItem[] = [];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  pageId: string;
  worldId: string;
  splitMode?: boolean;
  focused?: boolean;
  onFocus?: () => void;
  onClose?: () => void;
  onNavigate?: (targetPageId: string) => void;
};

export function PagePaneContent({
  pageId,
  worldId,
  splitMode = false,
  focused = true,
  onFocus,
  onClose,
  onNavigate,
}: Props) {
  const router = useRouter();
  const { isMobile } = useBreakpoint();
  const world = useCurrentWorldStore((s) => s.world);
  const { setActiveSectionId } = useActiveSection();
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const page = useMemo(
    () => (allPages ?? []).find((p) => p.id === pageId),
    [allPages, pageId],
  );
  const mentionablePages = useMemo(
    () => (allPages ?? EMPTY_PAGES).filter((p) => p.id !== pageId),
    [allPages, pageId],
  );
  const sectionLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sections) map.set(s.id, s.name);
    return (id: string) => map.get(id) ?? '';
  }, [sections]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const bodyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBodyRef = useRef<{
    body: object;
    bodyText: string;
    bodyRefs: string[];
  } | null>(null);

  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const toggleVisibility = usePageVisibilityToggle(page ?? null);
  const isWorldOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const [shareOpen, setShareOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [factsOpen, setFactsOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const removePage = usePagesStore((s) => s.removePage);

  const [worldPins, setWorldPins] = useState<MapPin[]>([]);
  const [worldMaps, setWorldMaps] = useState<WorldMap[]>([]);
  const [pinTypes, setPinTypes] = useState<PinType[]>([]);
  useEffect(() => {
    if (!worldId) return;
    let cancelled = false;
    Promise.all([listPinsForWorld(worldId), listMaps(worldId), listPinTypes()]).then(
      ([pinsRes, mapsRes, typesRes]) => {
        if (cancelled) return;
        setWorldPins((pinsRes.data ?? []) as MapPin[]);
        setWorldMaps((mapsRes.data ?? []) as WorldMap[]);
        setPinTypes((typesRes.data ?? []) as PinType[]);
      },
    );
    return () => { cancelled = true; };
  }, [worldId]);

  const mentionablePins: MentionPinItem[] = useMemo(() => {
    if (worldPins.length === 0) return [];
    const mapLabelById = new Map(worldMaps.map((m) => [m.id, m.label]));
    const typeByKey = new Map(pinTypes.map((t) => [t.key, t]));
    return worldPins.map((pin) => {
      const type = typeByKey.get(pin.pin_type);
      const label = pin.label?.trim() || type?.label || 'Pin';
      const icon = pin.icon_key_override ?? type?.default_icon_key ?? 'map-pin';
      const mapLabel = mapLabelById.get(pin.map_id) ?? 'Map';
      return { id: pin.id, mapId: pin.map_id, label, mapLabel, icon };
    });
  }, [worldPins, worldMaps, pinTypes]);

  const [mentionableEvents, setMentionableEvents] = useState<MentionEventItem[]>(EMPTY_MENTION_EVENTS);
  const timelinePages = useMemo(
    () => (allPages ?? EMPTY_PAGES).filter((p) => p.page_kind === 'timeline'),
    [allPages],
  );
  useEffect(() => {
    if (timelinePages.length === 0) {
      setMentionableEvents(EMPTY_MENTION_EVENTS);
      return;
    }
    let cancelled = false;
    Promise.all(timelinePages.map((tp) => getEventsForTimeline(tp.id))).then(
      (results) => {
        if (cancelled) return;
        const items: MentionEventItem[] = [];
        results.forEach((res, idx) => {
          const tp = timelinePages[idx];
          for (const ev of (res.data ?? []) as { id: string; title: string; timeline_page_id: string }[]) {
            items.push({
              id: tp.id,
              eventId: ev.id,
              label: ev.title,
              timelineTitle: tp.title,
              icon: 'calendar-days',
            });
          }
        });
        setMentionableEvents(items);
      },
    );
    return () => { cancelled = true; };
  }, [timelinePages]);

  const [lockError, setLockError] = useState<{ ownerId: string; since: string } | null>(null);
  const [canEdit, setCanEdit] = useState(isWorldOwner);

  useEffect(() => {
    if (isWorldOwner) { setCanEdit(true); return; }
    if (!pageId || !myUserId) return;
    const check = () => getMyPagePermission(pageId).then(({ data }) => setCanEdit(data === 'edit'));
    void check();
    const channel = supabase.channel(`perm:${pageId}:${myUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'world_page_permissions',
        filter: `page_id=eq.${pageId}`,
      }, () => void check())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pageId, myUserId, isWorldOwner]);

  const section = useMemo(
    () => sections.find((sec) => sec.id === page?.section_id) ?? null,
    [sections, page],
  );

  const isOrphan = useMemo(() => {
    if (!isWorldOwner) return false;
    if (!page || !page.parent_page_id) return false;
    return !(allPages ?? []).some((p) => p.id === page.parent_page_id);
  }, [isWorldOwner, page, allPages]);

  const lockOwnerId = page?.editing_user_id ?? null;
  const lockSince = page?.editing_since ?? null;
  const lockFresh =
    lockSince !== null && Date.now() - Date.parse(lockSince) < 90_000;
  const heldByOther =
    lockFresh && lockOwnerId !== null && myUserId !== null && lockOwnerId !== myUserId;
  const bannerLock = heldByOther
    ? { ownerId: lockOwnerId as string, since: lockSince as string }
    : lockError;
  const readOnly = !canEdit || heldByOther;

  useEffect(() => {
    if (section && !splitMode) setActiveSectionId(section.id);
  }, [section, setActiveSectionId, splitMode]);

  const lockCtxRef = useRef({ lockOwnerId, lockSince, myUserId, updatePageInStore });
  lockCtxRef.current = { lockOwnerId, lockSince, myUserId, updatePageInStore };

  const tryClaim = useCallback(async () => {
    if (!pageId || !canEdit) return;
    const { data, error } = await claimPageEdit(pageId);
    const ctx = lockCtxRef.current;
    if (error) {
      const msg = (error as any)?.message ?? '';
      const isLockConflict = msg.includes('locked') || msg.includes('another editor');
      if (isLockConflict && ctx.lockOwnerId && ctx.lockOwnerId !== ctx.myUserId && ctx.lockSince) {
        setLockError({ ownerId: ctx.lockOwnerId, since: ctx.lockSince });
      } else if (isLockConflict) {
        setLockError({
          ownerId: ctx.lockOwnerId ?? 'unknown',
          since: ctx.lockSince ?? new Date().toISOString(),
        });
      }
      return;
    }
    if (data) {
      ctx.updatePageInStore(data.id, {
        editing_user_id: data.editing_user_id,
        editing_since: data.editing_since,
      });
      setLockError(null);
    }
  }, [pageId]);

  useEffect(() => {
    if (!pageId) return;
    let released = false;
    void tryClaim();
    const t = setInterval(() => {
      if (!released) void tryClaim();
    }, LOCK_HEARTBEAT_MS);
    return () => {
      released = true;
      clearInterval(t);
      if (bodyTimerRef.current) {
        clearTimeout(bodyTimerRef.current);
        bodyTimerRef.current = null;
        const pending = pendingBodyRef.current;
        if (pending) {
          pendingBodyRef.current = null;
          void updatePage(pageId, {
            body: pending.body as Json,
            body_text: pending.bodyText,
            body_refs: pending.bodyRefs,
          });
        }
      }
      void releasePageEdit(pageId);
    };
  }, [pageId, tryClaim]);

  const navigateTo = useCallback(
    (targetPageId: string) => {
      if (onNavigate) {
        onNavigate(targetPageId);
      } else {
        router.push(worldPageHref(worldId, targetPageId));
      }
    },
    [onNavigate, router, worldId],
  );

  async function flushAndNavigate(targetPageId: string) {
    if (bodyTimerRef.current) {
      clearTimeout(bodyTimerRef.current);
      bodyTimerRef.current = null;
    }
    const pending = pendingBodyRef.current;
    if (pending && pageId) {
      pendingBodyRef.current = null;
      await updatePage(pageId, {
        body: pending.body as Json,
        body_text: pending.bodyText,
        body_refs: pending.bodyRefs,
      });
    }
    navigateTo(targetPageId);
  }

  function handleCanvasChange(
    blocks: Array<{ id: string; x: number; y: number; width: number; height?: number; html: string }>,
    plainText: string,
    bodyRefs?: string[],
  ) {
    if (!pageId || heldByOther) return;
    const body = { __canvas_blocks: blocks };
    pendingBodyRef.current = { body, bodyText: plainText, bodyRefs: bodyRefs ?? [] };
    setSaveState('saving');
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(async () => {
      const p = pendingBodyRef.current;
      if (!p) return;
      pendingBodyRef.current = null;
      const { data, error } = await updatePage(pageId, {
        body: p.body as Json,
        body_text: p.bodyText,
        body_refs: p.bodyRefs,
      });
      if (error || !data) { setSaveState('error'); return; }
      updatePageInStore(pageId, { body: data.body, body_text: data.body_text, body_refs: data.body_refs });
      setSaveState('saved');
    }, 800);
  }

  function handleBodyChange(body: object, bodyText: string, bodyRefs: string[]) {
    if (!pageId || heldByOther) return;
    pendingBodyRef.current = { body, bodyText, bodyRefs };
    setSaveState('saving');
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(async () => {
      const p = pendingBodyRef.current;
      if (!p) return;
      pendingBodyRef.current = null;
      const { data, error } = await updatePage(pageId, {
        body: p.body as Json,
        body_text: p.bodyText,
        body_refs: p.bodyRefs,
      });
      if (error || !data) { setSaveState('error'); return; }
      updatePageInStore(pageId, { body: data.body, body_text: data.body_text, body_refs: data.body_refs });
      setSaveState('saved');
    }, 800);
  }

  async function handleDeletePage() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    if (!pageId || !page) return;
    await trashPage(pageId);
    removePage(pageId);
    router.replace(worldSectionHref(worldId!, page.section_id));
  }

  if (!world || !worldId || !pageId) return null;

  if (!page || !section) {
    return (
      <View style={styles.missing}>
        <Text variant="body-md" tone="secondary">Page not found.</Text>
        <Text
          variant="label-md"
          tone="accent"
          onPress={() => router.replace(worldHref(worldId))}
          style={{ marginTop: spacing.md, textDecorationLine: 'underline' }}
        >
          Back to world
        </Text>
      </View>
    );
  }

  // Specialized page-kind views
  const specializedView = (() => {
    if (page.page_kind === 'timeline')
      return <TimelinePageView page={page} worldId={worldId} splitMode={splitMode} />;
    if (page.page_kind === 'pc_stub' || page.page_kind === 'player_character')
      return <PCStubPageView page={page} worldId={worldId} splitMode={splitMode} />;
    if (page.page_kind === 'npc')
      return <NPCPageView page={page} worldId={worldId} splitMode={splitMode} />;
    if (page.page_kind === 'faction' || page.page_kind === 'organization' || page.page_kind === 'religion')
      return <FactionPageView page={page} worldId={worldId} splitMode={splitMode} />;
    if (page.page_kind === 'location')
      return <LocationPageView page={page} worldId={worldId} splitMode={splitMode} />;
    return null;
  })();

  if (specializedView) {
    if (splitMode) {
      const tpl = getTemplate(page.template_key as TemplateKey, page.template_version);
      const kl = PAGE_KIND_LABEL[page.page_kind] ?? 'Page';
      return (
        <View style={styles.root} onPointerDown={onFocus}>
          <SplitPaneTitle
            icon={tpl.icon}
            title={page.title}
            accentToken={tpl.accentToken}
            kindLabel={kl}
            saveState={saveState}
            focused={focused}
            onPress={onFocus}
            onClose={onClose}
          />
          {specializedView}
        </View>
      );
    }
    return specializedView;
  }

  // Default generic wiki view
  const template = getTemplate(page.template_key as TemplateKey, page.template_version);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Page';
  const isLore = page.page_kind === 'lore';

  return (
    <View
      style={styles.root}
      onPointerDown={onFocus}
    >
      {splitMode ? (
        <SplitPaneTitle
          icon={template.icon}
          title={page.title}
          accentToken={template.accentToken}
          kindLabel={kindLabel}
          saveState={saveState}
          focused={focused}
          onPress={onFocus}
          onClose={onClose}
        />
      ) : (
        <WorldTopBar
          crumbs={[
            { key: 'world', label: world.name },
            { key: 'section', label: section.name },
            { key: 'page', label: page.title },
          ]}
          saveState={saveState}
          actions={
            <>
              <PlayerViewToggle />
              <VisibilityBadge
                visibility={page.visible_to_players ? 'player' : 'gm'}
                interactive={isWorldOwner}
                onPress={() => setShareOpen(true)}
              />
              {isWorldOwner ? (
                <>
                  <Pressable
                    onPress={() => setShareOpen(true)}
                    style={styles.shareBtn}
                    accessibilityLabel="Share page"
                  >
                    <Icon name="share" size={14} color={colors.onSurfaceVariant} />
                    <Text
                      variant="label-md"
                      uppercase
                      weight="semibold"
                      style={{ color: colors.onSurfaceVariant, letterSpacing: 1, fontSize: 11 }}
                    >
                      Share
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDeletePage}
                    accessibilityLabel="Delete page"
                    hitSlop={8}
                  >
                    <Icon
                      name="delete-outline"
                      size={18}
                      color={confirmDelete ? colors.hpDanger : colors.outlineVariant}
                    />
                  </Pressable>
                </>
              ) : null}
            </>
          }
        />
      )}

      {confirmDelete ? (
        <View style={styles.deleteBanner}>
          <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>
            Delete this page and all sub-pages? Recoverable for 30 days.
          </Text>
          <Pressable onPress={() => setConfirmDelete(false)} style={styles.deleteBannerBtn}>
            <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={handleDeletePage} style={[styles.deleteBannerBtn, styles.deleteBannerConfirm]}>
            <Icon name="delete" size={14} color={colors.hpDanger} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>
              Confirm delete
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.wikiWrap}>
        <ScrollView
          style={styles.wikiDoc}
          contentContainerStyle={isMobile ? styles.wikiDocInnerMobile : (isLore ? styles.wikiDocInnerWide : styles.wikiDocInner)}
        >
          <View style={isMobile ? styles.headerWrapMobile : styles.headerWrap}>
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
                  fontSize: 36,
                  fontWeight: 500,
                  outline: 'none',
                  padding: '4px 8px',
                  width: '100%',
                  marginBottom: 8,
                }}
              />
            ) : (
              <PageHead
                icon={template.icon}
                title={page.title}
                meta={`${kindLabel} · ${section.name}`}
                accentToken={template.accentToken}
                onTitleDoubleClick={() => setEditingTitle(true)}
                actions={
                  isLore && template.fields.length > 0 && isWorldOwner ? (
                    <Pressable onPress={() => setFactsOpen(true)} style={styles.factsChip}>
                      <Icon name="info-outline" size={14} color={colors.primary} />
                      <Text variant="label-sm" weight="semibold" style={{ color: colors.primary }}>
                        Facts
                      </Text>
                    </Pressable>
                  ) : undefined
                }
              />
            )
          }
          </View>

          <View style={{ marginTop: splitMode ? spacing.sm : (isLore ? spacing.md : spacing.xl), gap: spacing.lg }}>
            {isOrphan ? <OrphanBanner page={page} /> : null}

            {bannerLock && isWorldOwner ? (
              <EditLockBanner
                ownerUserId={bannerLock.ownerId}
                lockedSinceIso={bannerLock.since}
                onRetry={tryClaim}
                onForceUnlock={isWorldOwner ? async () => {
                  await forceReleasePageEdit(pageId);
                  updatePageInStore(pageId, { editing_user_id: null, editing_since: null });
                  void tryClaim();
                } : undefined}
              />
            ) : null}

            <View
              style={readOnly ? styles.disabledEditor : undefined}
              pointerEvents={readOnly ? 'none' : 'auto'}
            >
              {!isLore && !isMobile ? (
                <StructuredFieldsForm
                  page={page}
                  template={template}
                  onSaveStateChange={setSaveState}
                />
              ) : null}

              <View style={[styles.bodySection, { marginTop: spacing.md, flex: 1 }]}>
                {page.page_kind === 'lore' ? (
                  <LoreCanvasEditor
                    initialBlocks={
                      (page.body as Record<string, unknown>)?.__canvas_blocks as
                        Array<{ id: string; x: number; y: number; width: number; height?: number; html: string }> | null
                        ?? null
                    }
                    onChange={handleCanvasChange}
                    editable={!readOnly}
                    mentionablePages={mentionablePages}
                    getSectionLabel={sectionLabelById}
                    onMentionClick={(targetPageId) => void flushAndNavigate(targetPageId)}
                    worldId={worldId}
                    pageId={pageId}
                  />
                ) : (
                  <BodyEditor
                    initialContent={(page.body as object) ?? null}
                    onChange={handleBodyChange}
                    editable={!readOnly}
                    placeholder={`Begin the chronicle of ${page.title}…`}
                    worldId={worldId}
                    pageId={pageId}
                    mentionablePages={mentionablePages}
                    mentionablePins={mentionablePins}
                    mentionableEvents={mentionableEvents}
                    getSectionLabel={sectionLabelById}
                    onMentionClick={(targetPageId) => void flushAndNavigate(targetPageId)}
                    onPinMentionClick={(_pinId, mapId) =>
                      router.push(worldMapHref(worldId, mapId))
                    }
                  />
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        {!isMobile ? (
          <WikiRightPanel
            pageId={page.id}
            worldId={worldId}
            defaultCollapsed={splitMode}
          />
        ) : null}
      </View>

      {/* Mobile sidebar overlay */}
      {isMobile ? (
        <>
          <Pressable
            style={mobileStyles.sidebarFab}
            onPress={() => setSidebarOpen(true)}
          >
            <Icon name="info-outline" size={20} color={colors.primary} />
          </Pressable>
          <Modal visible={sidebarOpen} transparent animationType="slide" onRequestClose={() => setSidebarOpen(false)}>
            <Pressable style={mobileStyles.sidebarBackdrop} onPress={() => setSidebarOpen(false)}>
              <Pressable style={mobileStyles.sidebarPanel} onPress={() => {}}>
                <View style={mobileStyles.sidebarHeader}>
                  <Text variant="title-sm" weight="bold" style={{ color: colors.onSurface }}>Details</Text>
                  <Pressable onPress={() => setSidebarOpen(false)} hitSlop={8}>
                    <Icon name="close" size={20} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
                <ScrollView>
                  {!isLore ? (
                    <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                      <StructuredFieldsForm page={page} template={template} onSaveStateChange={setSaveState} />
                    </View>
                  ) : null}
                  <WikiRightPanel pageId={page.id} worldId={worldId} />
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : null}

      {shareOpen ? (
        <ShareModal page={page} onClose={() => setShareOpen(false)} />
      ) : null}

      {template.fields.length > 0 ? (
        <FactsModal
          visible={factsOpen}
          page={page}
          template={template}
          onClose={() => setFactsOpen(false)}
          onSaveStateChange={setSaveState}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  headerWrap: { height: 120, overflow: 'hidden' as const },
  headerWrapMobile: { overflow: 'hidden' as const },
  wikiWrap: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  wikiDoc: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  wikiDocInner: {
    maxWidth: 780,
    paddingTop: 28,
    paddingHorizontal: 36,
    paddingBottom: 64,
  },
  wikiDocInnerWide: {
    paddingTop: 28,
    paddingHorizontal: 36,
    paddingBottom: 64,
  },
  wikiDocInnerMobile: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: 80,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCanvas,
  },
  bodySection: {
    gap: spacing.xs,
  },
  disabledEditor: {
    opacity: 0.55,
  },
  factsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary + '44',
    backgroundColor: colors.primaryContainer + '22',
  },
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
  deleteBannerConfirm: {
    borderWidth: 1,
    borderColor: colors.hpDanger + '55',
  },
});

const mobileStyles = StyleSheet.create({
  sidebarFab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.md,
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
  sidebarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sidebarPanel: {
    backgroundColor: colors.surfaceContainerHigh,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
});
