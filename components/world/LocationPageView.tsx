import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  getPagesLinkingTo,
  releasePageEdit,
  trashPage,
  updatePage,
} from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
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
  MetaLabel,
  Text,
  VisibilityBadge,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

import { BodyEditor } from './BodyEditor';
import { EditLockBanner } from './EditLockBanner';
import { PageHead } from './PageHead';
import { PlayerViewToggle } from './PlayerViewToggle';
import { ShareModal } from './ShareModal';
import { StructuredFieldsForm } from './StructuredFieldsForm';
import { WorldTopBar } from './WorldTopBar';
import { PAGE_KIND_LABEL, toMaterialIcon } from './helpers';
import { usePageVisibilityToggle } from './usePageVisibilityToggle';
import { worldHref, worldPageHref, worldSectionHref } from './worldHref';

const LOCK_HEARTBEAT_MS = 30_000;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  worldId: string;
};

export function LocationPageView({ page, worldId }: Props) {
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const mentionablePages = useMemo(
    () => (allPages ?? []).filter((p) => p.id !== page.id),
    [allPages, page.id],
  );
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const removePage = usePagesStore((s) => s.removePage);
  const bodyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const toggleVisibility = usePageVisibilityToggle(page);
  const isWorldOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const section = useMemo(
    () => sections.find((s) => s.id === page.section_id) ?? null,
    [sections, page],
  );
  const template = getTemplate(page.template_key as TemplateKey, page.template_version);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Location';

  // Lock
  const [lockError, setLockError] = useState<{ ownerId: string; since: string } | null>(null);
  const lockOwnerId = page.editing_user_id ?? null;
  const lockSince = page.editing_since ?? null;
  const lockFresh = lockSince !== null && Date.now() - Date.parse(lockSince) < 90_000;
  const heldByOther =
    lockFresh && lockOwnerId !== null && myUserId !== null && lockOwnerId !== myUserId;
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
      if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
      void releasePageEdit(page.id);
    };
  }, [page.id, tryClaim]);

  function handleBodyChange(body: object, bodyText: string, bodyRefs: string[]) {
    if (heldByOther) return;
    setSaveState('saving');
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(async () => {
      const { data, error } = await updatePage(page.id, {
        body: body as Json,
        body_text: bodyText,
        body_refs: bodyRefs,
      });
      if (error || !data) {
        setSaveState('error');
        return;
      }
      updatePageInStore(page.id, {
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
    await trashPage(page.id);
    removePage(page.id);
    router.replace(worldSectionHref(worldId, page.section_id));
  }

  // Right panel data
  const subpages = useMemo(
    () =>
      (allPages ?? [])
        .filter((p) => p.parent_page_id === page.id)
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order),
    [allPages, page.id],
  );

  const [backlinks, setBacklinks] = useState<WorldPage[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await getPagesLinkingTo(worldId, page.id);
      if (!cancelled) setBacklinks(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [page.id, worldId]);

  const sectionNameById = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  );

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'world', label: world?.name ?? '' },
          { key: 'section', label: section?.name ?? 'Locations' },
          { key: 'page', label: page.title },
        ]}
        saveState={saveState}
        actions={
          <>
            <PlayerViewToggle />
            {isWorldOwner ? (
              <>
                <Pressable onPress={() => setShareOpen(true)} style={styles.shareBtn}>
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
                <Pressable onPress={handleDeletePage} hitSlop={8}>
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
          <Pressable
            onPress={handleDeletePage}
            style={[styles.deleteBannerBtn, { borderWidth: 1, borderColor: colors.hpDanger + '55' }]}
          >
            <Icon name="delete" size={14} color={colors.hpDanger} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>
              Confirm
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.wikiWrap}>
        {/* Main content: PageHead + editor (full width) */}
        <ScrollView style={styles.mainCol} contentContainerStyle={styles.mainColInner}>
          <PageHead
            icon={template.icon}
            title={page.title}
            meta={`${kindLabel} · ${section?.name ?? ''}`}
            accentToken={template.accentToken}
            actions={
              <VisibilityBadge
                visibility={page.visible_to_players ? 'player' : 'gm'}
                interactive={!!toggleVisibility}
                onPress={toggleVisibility ?? undefined}
              />
            }
          />

          <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>
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
              <View style={styles.editorSection}>
                <BodyEditor
                  initialContent={(page.body as object) ?? null}
                  onChange={handleBodyChange}
                  editable={!heldByOther}
                  placeholder={`Describe ${page.title} — its history, inhabitants, secrets…`}
                  worldId={worldId}
                  pageId={page.id}
                  mentionablePages={mentionablePages}
                  onMentionClick={(targetPageId) =>
                    router.push(worldPageHref(worldId, targetPageId))
                  }
                />
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Right panel: Properties + Sub-pages + Backlinks */}
        <ScrollView style={styles.rightPanel} contentContainerStyle={styles.rightPanelInner}>
          {/* Properties section */}
          <View
            style={heldByOther ? styles.disabledEditor : undefined}
            pointerEvents={heldByOther ? 'none' : 'auto'}
          >
            <StructuredFieldsForm
              page={page}
              template={template}
              onSaveStateChange={setSaveState}
              compact
            />
          </View>

          {/* Sub-pages */}
          {subpages.length > 0 ? (
            <View style={styles.panelSection}>
              <MetaLabel size="sm" tone="muted" style={styles.panelSectionLabel}>
                Sub-pages
              </MetaLabel>
              {subpages.map((p) => {
                let iconName = 'article';
                try {
                  const tpl = getTemplate(p.template_key as TemplateKey, p.template_version);
                  iconName = toMaterialIcon(tpl.icon);
                } catch { /* default */ }
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => router.push(worldPageHref(worldId, p.id))}
                    style={styles.panelRow}
                  >
                    <Icon
                      name={iconName as React.ComponentProps<typeof Icon>['name']}
                      size={13}
                      color={colors.onSurfaceVariant}
                    />
                    <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>
                      {p.title}
                    </Text>
                    <Icon name="chevron-right" size={12} color={colors.outline} />
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Backlinks */}
          {backlinks.length > 0 ? (
            <View style={styles.panelSection}>
              <MetaLabel size="sm" tone="muted" style={styles.panelSectionLabel}>
                Linked from
              </MetaLabel>
              {backlinks.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(worldPageHref(worldId, p.id))}
                  style={styles.backlinkRow}
                >
                  <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 12 }}>
                    {p.title}
                  </Text>
                  <Text variant="label-sm" uppercase style={{ color: colors.outline, fontSize: 10, letterSpacing: 0.8 }}>
                    {PAGE_KIND_LABEL[p.page_kind] ?? 'Page'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  wikiWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },
  mainCol: { flex: 1, backgroundColor: colors.surfaceCanvas },
  mainColInner: {
    maxWidth: 900,
    paddingTop: 28,
    paddingHorizontal: 36,
    paddingBottom: 64,
    alignSelf: 'center',
    width: '100%',
  },
  editorSection: { flex: 1, minHeight: 400 },
  rightPanel: {
    width: 280,
    backgroundColor: colors.surfaceContainer,
    borderLeftWidth: 1,
    borderLeftColor: colors.outlineVariant + '55',
  },
  rightPanelInner: {
    padding: spacing.md,
    gap: spacing.lg,
  },
  panelSection: {
    gap: 4,
  },
  panelSectionLabel: {
    marginBottom: spacing.xs,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    marginBottom: 4,
  },
  backlinkRow: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.lg,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    backgroundColor: colors.surfaceContainerHigh,
    marginBottom: 4,
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
  disabledEditor: { opacity: 0.55 },
});
