import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  getEventsForTimeline,
  releasePageEdit,
  updatePage,
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
import type { Json, TemplateKey, TimelineEvent, WorldPage } from '@vaultstone/types';
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
import { worldHref } from './worldHref';
import { CalendarSchemaEditor } from './timeline/CalendarSchemaEditor';
import { TimelineEventCard } from './timeline/TimelineEventCard';
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
  const [eventEditorOpen, setEventEditorOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);

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

  const calendarSchema = useMemo(() => {
    const sf = page.structured_fields as Record<string, unknown> | null;
    const raw = sf?.__calendar_schema;
    if (!Array.isArray(raw)) return [];
    return raw;
  }, [page.structured_fields]);

  const handleEditEvent = (event: TimelineEvent) => {
    setEditingEvent(event);
    setEventEditorOpen(true);
  };

  const handleAddEvent = () => {
    setEditingEvent(null);
    setEventEditorOpen(true);
  };

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
            ) : null}
            <VisibilityBadge visibility={page.visible_to_players ? 'player' : 'gm'} />
          </>
        }
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <PageHead
          icon={template.icon}
          title={page.title}
          meta={`${PAGE_KIND_LABEL[page.page_kind] ?? 'Page'} · ${section.name}`}
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
            <CalendarSchemaEditor page={page} onSaveStateChange={setSaveState} />
          </View>

          {/* Timeline events */}
          <View style={styles.eventsSection}>
            <View style={styles.eventsHeader}>
              <Text variant="label-lg" weight="semibold" style={{ color: colors.onSurface }}>
                Events
              </Text>
              <MetaLabel size="sm" tone="muted">
                {events.length} event{events.length !== 1 ? 's' : ''}
              </MetaLabel>
              {isWorldOwner && !heldByOther ? (
                <Pressable onPress={handleAddEvent} style={styles.addEventBtn}>
                  <Icon name="add" size={16} color={colors.cosmic} />
                  <Text variant="label-md" style={{ color: colors.cosmic }}>
                    Add event
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {events.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="event" size={32} color={colors.outlineVariant} />
                <Text variant="body-md" tone="secondary" style={{ marginTop: spacing.sm }}>
                  No events yet. Add your first timeline event.
                </Text>
              </View>
            ) : (
              <View style={styles.eventsList}>
                {events.map((event) => (
                  <TimelineEventCard
                    key={event.id}
                    event={event}
                    calendarSchema={calendarSchema}
                    isOwner={isWorldOwner}
                    onEdit={() => handleEditEvent(event)}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {shareOpen ? (
        <ShareModal page={page} onClose={() => setShareOpen(false)} />
      ) : null}

      {eventEditorOpen ? (
        <EventEditorModal
          worldId={worldId}
          timelinePageId={page.id}
          calendarSchema={calendarSchema}
          event={editingEvent}
          onClose={() => {
            setEventEditorOpen(false);
            setEditingEvent(null);
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
    maxWidth: 780,
    paddingTop: 28,
    paddingHorizontal: 48,
    paddingBottom: 64,
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
  disabledEditor: {
    opacity: 0.55,
  },
  eventsSection: {
    gap: spacing.md,
  },
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addEventBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.DEFAULT,
    borderWidth: 1,
    borderColor: colors.cosmic + '44',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
  },
  eventsList: {
    gap: spacing.md,
  },
});
