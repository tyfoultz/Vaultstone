import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  getEventsForTimeline,
  releasePageEdit,
  trashPage,
} from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import {
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
  selectSectionsForWorld,
  useTimelineEventsStore,
  selectEventsForPage,
} from '@vaultstone/store';
import type { Json, TemplateKey, TimelineCalendarSchema, TimelineEvent, WorldPage } from '@vaultstone/types';
import {
  Icon,
  MetaLabel,
  Text,
  VisibilityBadge,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

import { EditLockBanner } from './EditLockBanner';
import { PageHead } from './PageHead';
import { PlayerViewToggle } from './PlayerViewToggle';
import { ShareModal } from './ShareModal';
import { WorldTopBar } from './WorldTopBar';
import { PAGE_KIND_LABEL } from './helpers';
import { usePageVisibilityToggle } from './usePageVisibilityToggle';
import { worldSectionHref } from './worldHref';
import { CalendarSchemaEditor } from './timeline/CalendarSchemaEditor';
import { EraRibbon } from './timeline/EraRibbon';
import { TimelineSpine } from './timeline/TimelineSpine.web';
import { EventEditorModal } from './timeline/EventEditorModal';

const LOCK_HEARTBEAT_MS = 30_000;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  worldId: string;
};

export function TimelinePageView({ page, worldId }: Props) {
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const section = useMemo(
    () => sections.find((sec) => sec.id === page.section_id) ?? null,
    [sections, page],
  );
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const isWorldOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const toggleVisibility = usePageVisibilityToggle(page);
  const updatePageInStore = usePagesStore((s) => s.updatePage);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const removePage = usePagesStore((s) => s.removePage);
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [defaultEra, setDefaultEra] = useState<string | undefined>(undefined);
  const [activeEra, setActiveEra] = useState<string | null>(null);
  const [schemaExpanded, setSchemaExpanded] = useState(false);

  // Edit lock
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
  }, [page.id]);

  useEffect(() => {
    void tryClaim();
    const t = setInterval(() => void tryClaim(), LOCK_HEARTBEAT_MS);
    return () => {
      clearInterval(t);
      void releasePageEdit(page.id);
    };
  }, [page.id, tryClaim]);

  // Timeline events
  const events = useTimelineEventsStore((s) => selectEventsForPage(s, page.id));
  const setEventsForPage = useTimelineEventsStore((s) => s.setEventsForPage);

  useEffect(() => {
    let cancelled = false;
    getEventsForTimeline(page.id).then(({ data }) => {
      if (!cancelled && data) {
        setEventsForPage(page.id, data as TimelineEvent[]);
      }
    });
    return () => { cancelled = true; };
  }, [page.id, setEventsForPage]);

  const template = getTemplate(page.template_key as TemplateKey, page.template_version);

  const schema: TimelineCalendarSchema = useMemo(() => {
    const sf = page.structured_fields as Record<string, unknown> | null;
    const raw = sf?.__calendar_schema;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { eras: [] };
    const s = raw as TimelineCalendarSchema;
    if (Array.isArray(s.eras)) return s;
    return { eras: [] };
  }, [page.structured_fields]);

  const hasEras = schema.eras.length > 0;
  const eraCount = schema.eras.filter((e) => e.label).length;

  const calendarBreadcrumbLevels = useMemo(() => {
    if (!hasEras) return [];
    const levels = ['Era'];
    const allLevelNames = new Set<string>();
    for (const era of schema.eras) {
      for (const dl of era.dateLevels) {
        if (dl.label) allLevelNames.add(dl.label);
      }
    }
    for (const name of allLevelNames) levels.push(name);
    return levels;
  }, [schema.eras, hasEras]);

  const handleEditEvent = (event: TimelineEvent) => {
    setEditingEvent(event);
    setDefaultEra(undefined);
    setEventEditorOpen(true);
  };

  const handleAddEvent = (eraValue?: string) => {
    setEditingEvent(null);
    setDefaultEra(eraValue);
    setEventEditorOpen(true);
  };

  async function handleDeletePage() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await trashPage(page.id);
    removePage(page.id);
    router.replace(worldSectionHref(worldId, page.section_id));
  }

  if (!world || !section) return null;

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
                    style={{ color: colors.onSurfaceVariant, letterSpacing: 1, fontSize: 11 }}
                  >
                    Share
                  </Text>
                </Pressable>
                <Pressable onPress={handleDeletePage} accessibilityLabel="Delete page" hitSlop={8}>
                  <Icon name="delete-outline" size={18} color={confirmDelete ? colors.hpDanger : colors.outlineVariant} />
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
            Delete this timeline and all events? Recoverable for 30 days.
          </Text>
          <Pressable onPress={() => setConfirmDelete(false)} style={styles.deleteBannerBtn}>
            <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleDeletePage} style={[styles.deleteBannerBtn, styles.deleteBannerConfirm]}>
            <Icon name="delete" size={14} color={colors.hpDanger} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>Confirm</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Page head with event stats */}
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <PageHead
              icon={template.icon}
              title={page.title}
              meta={`${events.length} events · ${eraCount} eras`}
              accentToken={template.accentToken}
              actions={
                <VisibilityBadge
                  visibility={page.visible_to_players ? 'player' : 'gm'}
                  interactive={!!toggleVisibility}
                  onPress={toggleVisibility ?? undefined}
                />
              }
            />
          </View>
          {isWorldOwner && !heldByOther ? (
            <View style={styles.headActions}>
              <Pressable onPress={() => handleAddEvent()} style={styles.addEventBtn}>
                <Icon name="add" size={16} color={colors.onPrimary} />
                <Text variant="label-md" weight="bold" style={{ color: colors.onPrimary, fontSize: 12 }}>
                  ADD EVENT
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {bannerLock ? (
          <EditLockBanner
            ownerUserId={bannerLock.ownerId}
            lockedSinceIso={bannerLock.since}
            onRetry={tryClaim}
          />
        ) : null}

        {/* Calendar breadcrumb + schema editor toggle */}
        <View style={styles.calendarBar}>
          <Pressable
            style={styles.calendarBreadcrumb}
            onPress={() => setSchemaExpanded(!schemaExpanded)}
          >
            <Icon name="event" size={14} color={colors.outlineVariant} />
            <Text variant="label-sm" uppercase weight="semibold" style={styles.calLabel}>
              Calendar
            </Text>
            {calendarBreadcrumbLevels.map((level, i) => (
              <View key={i} style={styles.breadcrumbItem}>
                <Text variant="label-sm" style={{ color: colors.outlineVariant }}>›</Text>
                <Text variant="label-sm" weight={i === 0 ? 'bold' : 'regular'} style={{ color: colors.onSurfaceVariant }}>
                  {level}
                </Text>
              </View>
            ))}
            <View style={{ flex: 1 }} />
            <Icon
              name={schemaExpanded ? 'expand-less' : 'expand-more'}
              size={16}
              color={colors.outlineVariant}
            />
          </Pressable>
        </View>

        {/* Collapsible schema editor */}
        {schemaExpanded ? (
          <View
            style={heldByOther ? styles.disabledEditor : undefined}
            pointerEvents={heldByOther ? 'none' : 'auto'}
          >
            <CalendarSchemaEditor page={page} onSaveStateChange={setSaveState} />
          </View>
        ) : null}

        {/* Era ribbon */}
        {hasEras ? (
          <EraRibbon
            events={events}
            eras={schema.eras}
            activeEra={activeEra}
            onSelectEra={setActiveEra}
          />
        ) : null}

        {/* Timeline spine */}
        <View
          style={heldByOther ? styles.disabledEditor : undefined}
          pointerEvents={heldByOther ? 'none' : 'auto'}
        >
          <TimelineSpine
            events={events}
            schema={schema}
            isOwner={isWorldOwner}
            activeEra={activeEra}
            onEditEvent={handleEditEvent}
            onAddEvent={handleAddEvent}
          />
        </View>
      </ScrollView>

      {shareOpen ? (
        <ShareModal page={page} onClose={() => setShareOpen(false)} />
      ) : null}

      {eventEditorOpen ? (
        <EventEditorModal
          worldId={worldId}
          timelinePageId={page.id}
          schema={schema}
          event={editingEvent}
          defaultEra={defaultEra}
          onClose={() => {
            setEventEditorOpen(false);
            setEditingEvent(null);
            setDefaultEra(undefined);
          }}
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
  scrollView: {
    flex: 1,
  },
  content: {
    maxWidth: 900,
    paddingTop: 28,
    paddingHorizontal: 48,
    paddingBottom: 64,
    alignSelf: 'center',
    width: '100%',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  headActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  addEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryContainer,
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
  calendarBar: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  calendarBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 6,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
  },
  calLabel: {
    color: colors.outlineVariant,
    letterSpacing: 1,
    fontSize: 11,
  },
  breadcrumbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  disabledEditor: {
    opacity: 0.55,
  },
  deleteBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.dangerContainer + '44',
    borderBottomWidth: 1, borderBottomColor: colors.hpDanger + '33',
  },
  deleteBannerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.lg,
  },
  deleteBannerConfirm: {
    borderWidth: 1, borderColor: colors.hpDanger + '55',
  },
});
