import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  claimPageEdit,
  getEventsForTimeline,
  listMaps,
  listPinsForWorld,
  listPinTypes,
  releasePageEdit,
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
} from '@vaultstone/ui';

import { useActiveSection } from '../../../../components/world/ActiveSectionContext';
import { BodyEditor } from '../../../../components/world/BodyEditor';
import type { MentionPinItem, MentionEventItem } from '../../../../components/world/MentionSuggestion.web';
import { EditLockBanner } from '../../../../components/world/EditLockBanner';
import { PageHead } from '../../../../components/world/PageHead';
import { OrphanBanner } from '../../../../components/world/OrphanBanner';
import { PlayerViewToggle } from '../../../../components/world/PlayerViewToggle';
import { FactsModal } from '../../../../components/world/FactsModal';
import { ShareModal } from '../../../../components/world/ShareModal';
import { StructuredFieldsForm } from '../../../../components/world/StructuredFieldsForm';
import { NPCPageView } from '../../../../components/world/NPCPageView';
import { TimelinePageView } from '../../../../components/world/TimelinePageView';
import { PCStubPageView } from '../../../../components/world/players/PCStubPageView';
import { WikiRightPanel } from '../../../../components/world/WikiRightPanel';
import { WorldTopBar } from '../../../../components/world/WorldTopBar';
import { PAGE_KIND_LABEL } from '../../../../components/world/helpers';
import { usePageVisibilityToggle } from '../../../../components/world/usePageVisibilityToggle';
import { worldHref, worldMapHref, worldPageHref, worldSectionHref } from '../../../../components/world/worldHref';
import type { Json, TemplateKey, WorldPage } from '@vaultstone/types';

// Re-claim the lock every 30s so our editing_since stays within the server-
// side 90s TTL. 30s × 3 windows before expiry keeps a brief network blip from
// surrendering the lock.
const LOCK_HEARTBEAT_MS = 30_000;

const EMPTY_PAGES: WorldPage[] = [];
const EMPTY_MENTION_EVENTS: MentionEventItem[] = [];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function PageDetailScreen() {
  const { worldId, pageId } = useLocalSearchParams<{ worldId: string; pageId: string }>();
  const router = useRouter();
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
  const [factsOpen, setFactsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const removePage = usePagesStore((s) => s.removePage);

  // Mention popover can link to pins as well as pages. We fetch pins +
  // their owning maps + pin types once per world so the @ suggestion list
  // can render a pin option without an extra round-trip per keystroke.
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
    return () => {
      cancelled = true;
    };
  }, [worldId]);

  const mentionablePins: MentionPinItem[] = useMemo(() => {
    if (worldPins.length === 0) return [];
    const mapLabelById = new Map(worldMaps.map((m) => [m.id, m.label]));
    const typeByKey = new Map(pinTypes.map((t) => [t.key, t]));
    return worldPins
      .map((pin) => {
        const type = typeByKey.get(pin.pin_type);
        const label = pin.label?.trim() || type?.label || 'Pin';
        const icon = pin.icon_key_override ?? type?.default_icon_key ?? 'map-pin';
        const mapLabel = mapLabelById.get(pin.map_id) ?? 'Map';
        return {
          id: pin.id,
          mapId: pin.map_id,
          label,
          mapLabel,
          icon,
        };
      });
  }, [worldPins, worldMaps, pinTypes]);

  // Timeline events for the @ mention popover. Fetch events from all timeline
  // pages in this world so any event is mentionable from any page.
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

  // Lock state derived from `page` is authoritative for "who holds the lock
  // right now" (updated via claim RPC's RETURNING row + optimistic store
  // write). `lockError` captures the most recent claim failure so we can
  // render the banner even before the next real-time sync arrives.
  const [lockError, setLockError] = useState<{ ownerId: string; since: string } | null>(
    null,
  );

  const section = useMemo(
    () => sections.find((sec) => sec.id === page?.section_id) ?? null,
    [sections, page],
  );

  // Orphan detection: page has a parent pointer but the parent has left the
  // local cache (soft-deleted / unlinked). The store holds only non-deleted
  // pages, so a missing match == a missing parent.
  const isOrphan = useMemo(() => {
    if (!page || !page.parent_page_id) return false;
    return !(allPages ?? []).some((p) => p.id === page.parent_page_id);
  }, [page, allPages]);

  // Lock state derived from `page`. Fresh = within the 90s server TTL.
  const lockOwnerId = page?.editing_user_id ?? null;
  const lockSince = page?.editing_since ?? null;
  const lockFresh =
    lockSince !== null && Date.now() - Date.parse(lockSince) < 90_000;
  const heldByOther =
    lockFresh && lockOwnerId !== null && myUserId !== null && lockOwnerId !== myUserId;
  // Surface the banner either from the page row (other user holds a fresh
  // lock) or from the most recent claim error (server rejected us — someone
  // else got it in the gap since our last refetch).
  const bannerLock = heldByOther
    ? { ownerId: lockOwnerId as string, since: lockSince as string }
    : lockError;

  useEffect(() => {
    if (section) setActiveSectionId(section.id);
  }, [section, setActiveSectionId]);

  // Ref over the lock state + store writer so the heartbeat effect can read
  // the latest values without having them in its dep array — otherwise the
  // release-on-unmount cleanup would fire on every page row change.
  const lockCtxRef = useRef({ lockOwnerId, lockSince, myUserId, updatePageInStore });
  lockCtxRef.current = { lockOwnerId, lockSince, myUserId, updatePageInStore };

  const tryClaim = useCallback(async () => {
    if (!pageId) return;
    const { data, error } = await claimPageEdit(pageId);
    const ctx = lockCtxRef.current;
    if (error) {
      // Server rejected the claim — someone else got in. Use the current
      // page row to populate the banner; if the row hasn't synced yet,
      // fall back to a generic marker.
      if (ctx.lockOwnerId && ctx.lockOwnerId !== ctx.myUserId && ctx.lockSince) {
        setLockError({ ownerId: ctx.lockOwnerId, since: ctx.lockSince });
      } else {
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
    // Claim on mount; re-claim every heartbeat to refresh editing_since so
    // the server's 90s TTL doesn't expire under us.
    void tryClaim();
    const t = setInterval(() => {
      void tryClaim();
    }, LOCK_HEARTBEAT_MS);
    return () => {
      clearInterval(t);
      if (bodyTimerRef.current) {
        clearTimeout(bodyTimerRef.current);
        bodyTimerRef.current = null;
      }
      void releasePageEdit(pageId);
    };
  }, [pageId, tryClaim]);

  function handleBodyChange(body: object, bodyText: string, bodyRefs: string[]) {
    if (!pageId) return;
    // Belt-and-suspenders: even with the editor disabled when locked, a
    // pending write from before the lock arrived shouldn't fire.
    if (heldByOther) return;
    pendingBodyRef.current = { body, bodyText, bodyRefs };
    setSaveState('saving');
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(async () => {
      const pending = pendingBodyRef.current;
      if (!pending) return;
      pendingBodyRef.current = null;
      const { data, error } = await updatePage(pageId, {
        body: pending.body as Json,
        body_text: pending.bodyText,
        body_refs: pending.bodyRefs,
      });
      if (error || !data) {
        setSaveState('error');
        return;
      }
      updatePageInStore(pageId, {
        body: data.body,
        body_text: data.body_text,
        body_refs: data.body_refs,
      });
      setSaveState('saved');
    }, 800);
  }

  async function handleDeletePage() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!pageId || !page) return;
    await trashPage(pageId);
    removePage(pageId);
    router.replace(worldSectionHref(worldId!, page.section_id));
  }

  if (!world || !worldId || !pageId) return null;

  if (!page || !section) {
    return (
      <View style={styles.missing}>
        <Text variant="body-md" tone="secondary">
          Page not found.
        </Text>
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

  // Timeline pages get their own dedicated view
  if (page.page_kind === 'timeline') {
    return <TimelinePageView page={page} worldId={worldId} />;
  }

  // PC stub / player character pages get the enrichment view
  if (page.page_kind === 'pc_stub' || page.page_kind === 'player_character') {
    return <PCStubPageView page={page} worldId={worldId} />;
  }

  // NPC pages get the profile layout
  if (page.page_kind === 'npc') {
    return <NPCPageView page={page} worldId={worldId} />;
  }

  const template = getTemplate(page.template_key as TemplateKey, page.template_version);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Page';

  return (
    <View style={styles.root}>
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
                    style={{
                      color: colors.onSurfaceVariant,
                      letterSpacing: 1,
                      fontSize: 11,
                    }}
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
            <VisibilityBadge visibility={page.visible_to_players ? 'player' : 'gm'} />
          </>
        }
      />

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
        <ScrollView style={styles.wikiDoc} contentContainerStyle={styles.wikiDocInner}>
          <PageHead
            icon={template.icon}
            title={page.title}
            meta={`${kindLabel} · ${section.name}`}
            accentToken={template.accentToken}
            actions={
              <VisibilityBadge
              visibility={page.visible_to_players ? 'player' : 'gm'}
              interactive={!!toggleVisibility}
              onPress={toggleVisibility ?? undefined}
            />
            }
          />

          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            {isOrphan ? <OrphanBanner page={page} /> : null}

            {bannerLock ? (
              <EditLockBanner
                ownerUserId={bannerLock.ownerId}
                lockedSinceIso={bannerLock.since}
                onRetry={tryClaim}
              />
            ) : null}

            <View
              style={heldByOther ? styles.disabledEditor : undefined}
              pointerEvents={heldByOther ? 'none' : 'auto'}
            >
              {page.page_kind === 'lore' && template.fields.length > 0 ? (
                <Pressable onPress={() => setFactsOpen(true)} style={styles.factsChip}>
                  <Icon name="info-outline" size={14} color={colors.primary} />
                  <Text variant="label-sm" weight="semibold" style={{ color: colors.primary }}>
                    Facts
                  </Text>
                  <Icon name="chevron-right" size={14} color={colors.primary} />
                </Pressable>
              ) : (
                <StructuredFieldsForm
                  page={page}
                  template={template}
                  onSaveStateChange={setSaveState}
                />
              )}

              <View style={[styles.bodySection, { marginTop: spacing.lg, flex: 1 }]}>
                <BodyEditor
                  initialContent={(page.body as object) ?? null}
                  onChange={handleBodyChange}
                  editable={!heldByOther}
                  placeholder={`Begin the chronicle of ${page.title}…`}
                  worldId={worldId}
                  pageId={pageId}
                  mentionablePages={mentionablePages}
                  mentionablePins={mentionablePins}
                  mentionableEvents={mentionableEvents}
                  getSectionLabel={sectionLabelById}
                  onMentionClick={(targetPageId) =>
                    router.push(worldPageHref(worldId, targetPageId))
                  }
                  onPinMentionClick={(_pinId, mapId) =>
                    router.push(worldMapHref(worldId, mapId))
                  }
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <WikiRightPanel pageId={page.id} worldId={worldId} />
      </View>

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
