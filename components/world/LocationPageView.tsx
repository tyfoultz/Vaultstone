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
  fonts,
  radius,
  spacing,
} from '@vaultstone/ui';

import { BodyEditor } from './BodyEditor';
import { EditLockBanner } from './EditLockBanner';
import { PlayerViewToggle } from './PlayerViewToggle';
import { ShareModal } from './ShareModal';
import { WorldTopBar } from './WorldTopBar';
import { PAGE_KIND_LABEL, toMaterialIcon } from './helpers';
import { usePageVisibilityToggle } from './usePageVisibilityToggle';
import { worldPageHref, worldSectionHref } from './worldHref';

const LOCK_HEARTBEAT_MS = 30_000;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  worldId: string;
};

const DANGER_COLOR: Record<string, string> = {
  safe: colors.hpHealthy,
  low: colors.player,
  moderate: colors.hpWarning,
  high: colors.hpDanger,
  deadly: colors.hpDanger,
};

const MENTION_ICON: Record<string, { icon: string; color: string }> = {
  npc: { icon: 'person', color: colors.hpDanger },
  location: { icon: 'place', color: colors.primary },
  faction: { icon: 'shield', color: colors.hpWarning },
  lore: { icon: 'auto-stories', color: colors.cosmic },
  timeline: { icon: 'timeline', color: colors.secondary },
  custom: { icon: 'article', color: colors.onSurfaceVariant },
  item: { icon: 'diamond', color: colors.hpWarning },
};

type RightTab = 'on_this_page' | 'sub_locations' | 'history';

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
  const pendingBodyRef = useRef<{ body: object; bodyText: string; bodyRefs: string[] } | null>(null);

  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const toggleVisibility = usePageVisibilityToggle(page);
  const isWorldOwner = !!world && !!myUserId && world.owner_user_id === myUserId;
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('on_this_page');

  const section = useMemo(
    () => sections.find((s) => s.id === page.section_id) ?? null,
    [sections, page],
  );
  const fields = (page.structured_fields as Record<string, unknown>) ?? {};

  const locationType = typeof fields.type === 'string' ? fields.type : '';
  const region = typeof fields.region === 'string' ? fields.region : '';
  const population = typeof fields.population === 'string' ? fields.population : '';
  const governance = typeof fields.governance === 'string' ? fields.governance : '';
  const dangerLevel = typeof fields.danger_level === 'string' ? fields.danger_level : '';
  const terrain = typeof fields.terrain === 'string' ? fields.terrain : '';
  const tags = Array.isArray(fields.tags) ? (fields.tags as string[]) : [];

  const parentLocationId = typeof fields.parent_location === 'string' ? fields.parent_location : null;
  const parentPage = parentLocationId
    ? (allPages ?? []).find((p) => p.id === parentLocationId) ?? null
    : null;

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
    pendingBodyRef.current = { body, bodyText, bodyRefs };
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
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setBacklinksLoaded(false);
    void (async () => {
      const { data } = await getPagesLinkingTo(worldId, page.id);
      if (!cancelled) {
        setBacklinks(data ?? []);
        setBacklinksLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [page.id, worldId]);

  const mentionedPages = useMemo(() => {
    const refs = page.body_refs ?? [];
    if (refs.length === 0) return [];
    const pages = allPages ?? [];
    return refs
      .map((id) => pages.find((p) => p.id === id))
      .filter((p): p is WorldPage => !!p);
  }, [page.body_refs, allPages]);

  const sectionLabelById = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  );

  // Property pills
  const propertyPills: Array<{ label: string; value: string; color?: string; icon?: string }> = [];
  if (locationType) propertyPills.push({ label: 'TYPE', value: locationType, icon: 'location-city' });
  if (region) propertyPills.push({ label: 'REGION', value: region, icon: 'public' });
  if (population) propertyPills.push({ label: 'POP', value: population, icon: 'groups' });
  if (governance) propertyPills.push({ label: 'RULER', value: governance, icon: 'person' });
  if (terrain) propertyPills.push({ label: 'TERRAIN', value: terrain, icon: 'terrain' });
  if (dangerLevel) {
    propertyPills.push({
      label: 'DANGER',
      value: dangerLevel.charAt(0).toUpperCase() + dangerLevel.slice(1),
      color: DANGER_COLOR[dangerLevel],
      icon: 'warning',
    });
  }

  const saveLabel = saveState === 'saving' ? 'Saving…' :
    saveState === 'saved' ? 'Saved · just now' :
    saveState === 'error' ? 'Save failed' : '';

  return (
    <View style={styles.root}>
      {/* ── Compact top bar: breadcrumbs + title + actions ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={{ marginRight: 6 }}>
            <Icon name="place" size={18} color={colors.primary} />
          </View>
          <Pressable onPress={() => router.push(worldSectionHref(worldId, page.section_id))}>
            <Text style={styles.crumb}>{section?.name?.toUpperCase() ?? 'LOCATIONS'}</Text>
          </Pressable>
          {parentPage ? (
            <>
              <Text style={styles.crumbSep}>/</Text>
              <Pressable onPress={() => router.push(worldPageHref(worldId, parentPage.id))}>
                <Text style={styles.crumb}>{parentPage.title.toUpperCase()}</Text>
              </Pressable>
            </>
          ) : null}
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

      {/* ── Title row ── */}
      <View style={styles.titleBar}>
        <Icon name="place" size={20} color={colors.primary} />
        <Text variant="headline-md" family="serif-display" weight="bold" style={styles.title}>
          {page.title}
        </Text>
      </View>

      {/* ── Property pills ── */}
      <View style={styles.pillBar}>
        {propertyPills.map((pill) => (
          <View
            key={pill.label}
            style={[
              styles.pill,
              pill.color ? { borderColor: pill.color + '44' } : undefined,
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
            <Text style={[styles.pillValue, pill.color ? { color: pill.color } : undefined]}>
              {pill.value}
            </Text>
          </View>
        ))}
        {tags.map((tag) => (
          <View key={tag} style={styles.tagPill}>
            <Text style={styles.tagDot}>·</Text>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
        <Pressable style={styles.tagPill}>
          <Text style={styles.tagText}>+ Tag</Text>
        </Pressable>
      </View>

      {confirmDelete ? (
        <View style={styles.deleteBanner}>
          <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>
            Delete this page and all sub-pages? Recoverable for 30 days.
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

      {/* ── Main area: editor + right sidebar ── */}
      <View style={styles.mainWrap}>
        {/* Editor column — full width, sticky toolbar, no card border */}
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
            <BodyEditor
              initialContent={(page.body as object) ?? null}
              onChange={handleBodyChange}
              editable={!heldByOther}
              stickyToolbar
              placeholder={`Begin the chronicle of ${page.title}…`}
              worldId={worldId}
              pageId={page.id}
              mentionablePages={mentionablePages}
              getSectionLabel={sectionLabelById}
              onMentionClick={(targetPageId) =>
                router.push(worldPageHref(worldId, targetPageId))
              }
            />
          </View>

          {/* Save state indicator */}
          {saveLabel ? (
            <View style={styles.saveIndicator}>
              <View style={[styles.saveDot, saveState === 'error' ? { backgroundColor: colors.hpDanger } : { backgroundColor: colors.hpHealthy }]} />
              <Text style={styles.saveText}>{saveLabel}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Right sidebar ── */}
        <View style={styles.rightPanel}>
          <View style={styles.rightTabs}>
            <RightTabBtn label="On This Page" active={rightTab === 'on_this_page'} onPress={() => setRightTab('on_this_page')} />
            <RightTabBtn label="Sub-locations" active={rightTab === 'sub_locations'} onPress={() => setRightTab('sub_locations')} />
            <RightTabBtn label="History" active={rightTab === 'history'} onPress={() => setRightTab('history')} />
          </View>

          <ScrollView contentContainerStyle={styles.rightBody}>
            {rightTab === 'on_this_page' ? (
              <>
                <View style={styles.sideSection}>
                  <SideSectionHeader icon="place" title="MAP PIN" />
                  <View style={styles.mapPlaceholder}>
                    <Icon name="map" size={24} color={colors.outline} />
                    <Text variant="body-sm" style={{ color: colors.outline, marginTop: 4 }}>No map pin set</Text>
                  </View>
                </View>

                <View style={styles.sideSection}>
                  <SideSectionHeader icon="alternate-email" title="MENTIONED ON THIS PAGE" count={mentionedPages.length || undefined} />
                  {mentionedPages.length === 0 ? (
                    <Text variant="body-sm" style={styles.emptyText}>No mentions yet.</Text>
                  ) : (
                    mentionedPages.map((mp) => {
                      const mi = MENTION_ICON[mp.page_kind] ?? MENTION_ICON.custom;
                      return (
                        <Pressable key={mp.id} onPress={() => router.push(worldPageHref(worldId, mp.id))} style={styles.mentionRow}>
                          <View style={[styles.mentionDot, { backgroundColor: mi.color }]} />
                          <View style={{ flex: 1 }}>
                            <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{mp.title}</Text>
                            <Text style={styles.mentionMeta}>{(PAGE_KIND_LABEL[mp.page_kind] ?? 'Page').toUpperCase()}</Text>
                          </View>
                          <Icon name="chevron-right" size={12} color={colors.outline} />
                        </Pressable>
                      );
                    })
                  )}
                </View>

                <View style={styles.sideSection}>
                  <SideSectionHeader icon="history" title="SEEN IN PLAY" />
                  <Text variant="body-sm" style={styles.emptyText}>No session references yet.</Text>
                </View>

                <View style={styles.sideSection}>
                  <SideSectionHeader icon="link" title="LINKED FROM" count={backlinksLoaded && backlinks.length > 0 ? backlinks.length : undefined} />
                  {backlinksLoaded && backlinks.length === 0 ? (
                    <Text variant="body-sm" style={styles.emptyText}>No backlinks yet.</Text>
                  ) : (
                    backlinks.map((bl) => (
                      <Pressable key={bl.id} onPress={() => router.push(worldPageHref(worldId, bl.id))} style={styles.mentionRow}>
                        <View style={{ flex: 1 }}>
                          <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{bl.title}</Text>
                          <Text style={styles.mentionMeta}>{(PAGE_KIND_LABEL[bl.page_kind] ?? 'Page').toUpperCase()}</Text>
                        </View>
                        <Icon name="chevron-right" size={12} color={colors.outline} />
                      </Pressable>
                    ))
                  )}
                </View>
              </>
            ) : null}

            {rightTab === 'sub_locations' ? (
              subpages.length === 0 ? (
                <Text variant="body-sm" style={styles.emptyText}>No sub-locations yet.</Text>
              ) : (
                subpages.map((p) => {
                  let iconName = 'place';
                  try {
                    const tpl = getTemplate(p.template_key as TemplateKey, p.template_version);
                    iconName = toMaterialIcon(tpl.icon);
                  } catch { /* default */ }
                  return (
                    <Pressable key={p.id} onPress={() => router.push(worldPageHref(worldId, p.id))} style={styles.mentionRow}>
                      <Icon name={iconName as React.ComponentProps<typeof Icon>['name']} size={14} color={colors.primary} />
                      <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>{p.title}</Text>
                      <Icon name="chevron-right" size={12} color={colors.outline} />
                    </Pressable>
                  );
                })
              )
            ) : null}

            {rightTab === 'history' ? (
              <Text variant="body-sm" style={styles.emptyText}>Revision history coming soon.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
    </View>
  );
}

function RightTabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.rightTab, active && styles.rightTabActive]}>
      <Text variant="label-sm" uppercase weight="semibold" style={[styles.rightTabLabel, active && styles.rightTabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SideSectionHeader({ icon, title, count }: { icon: string; title: string; count?: number }) {
  return (
    <View style={styles.sideSectionHeader}>
      <Icon name={icon as React.ComponentProps<typeof Icon>['name']} size={13} color={colors.outline} />
      <Text style={styles.sideSectionTitle}>{title}</Text>
      {count != null ? <Text style={styles.sideSectionCount}>{count}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },

  // Top bar — compact breadcrumbs
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  crumb: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.outline,
  },
  crumbSep: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.outlineVariant,
    marginHorizontal: 6,
  },
  crumbActive: {
    fontFamily: fonts.label,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.onSurfaceVariant,
    fontWeight: '600',
  },

  // Title bar
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  title: {
    color: colors.onSurface,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
  },

  // Property pills — full width strip
  pillBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
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
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  tagDot: {
    fontFamily: fonts.label,
    fontSize: 12,
    color: colors.outline,
  },
  tagText: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },

  // Main area
  mainWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },

  // Editor column — no max-width, stretches to fill
  editorCol: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
    position: 'relative',
  },
  disabledEditor: { opacity: 0.55 },

  // Save indicator — overlays bottom-right of editor toolbar area
  saveIndicator: {
    position: 'absolute',
    top: 8,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 11,
  },
  saveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  saveText: {
    fontFamily: fonts.label,
    fontSize: 11,
    color: colors.outline,
  },

  // Right panel
  rightPanel: {
    width: 300,
    backgroundColor: colors.surfaceContainer,
    borderLeftWidth: 1,
    borderLeftColor: colors.outlineVariant + '33',
    flexDirection: 'column',
  },
  rightTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
    paddingHorizontal: spacing.xs,
  },
  rightTab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  rightTabActive: {
    borderBottomColor: colors.primary,
  },
  rightTabLabel: {
    color: colors.outline,
    fontSize: 10,
    letterSpacing: 1,
  },
  rightTabLabelActive: {
    color: colors.onSurface,
  },
  rightBody: {
    padding: spacing.md,
    gap: spacing.lg,
  },

  // Side sections
  sideSection: { gap: spacing.xs },
  sideSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sideSectionTitle: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.outline,
    flex: 1,
  },
  sideSectionCount: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.primary,
    fontWeight: '700',
  },

  mapPlaceholder: {
    height: 100,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: radius.lg,
  },
  mentionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mentionMeta: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.outline,
    marginTop: 1,
  },

  emptyText: {
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    fontSize: 12,
    paddingVertical: spacing.xs,
  },

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
