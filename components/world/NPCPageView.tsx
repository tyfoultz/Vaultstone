import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  getPagesLinkingTo,
  getEventsReferencingPage,
  releasePageEdit,
  trashPage,
  updatePage,
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

const THREAT_COLOR: Record<string, string> = {
  none: colors.outline,
  low: colors.player,
  moderate: colors.hpWarning,
  high: colors.hpDanger,
  legendary: colors.primary,
};

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
    const next = { ...fields, [key]: value };
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
  const threat = typeof fields.threat === 'string' ? fields.threat : '';
  const status = typeof fields.status === 'string' ? fields.status : '';
  const disposition = typeof fields.disposition === 'string' ? fields.disposition : '';
  const hooks = Array.isArray(fields.__hooks) ? (fields.__hooks as string[]) : [];

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
  const THREAT_OPTIONS = ['none', 'low', 'moderate', 'high', 'legendary'];
  const STATUS_OPTIONS = ['alive', 'dead', 'missing', 'unknown'];
  const DISPOSITION_OPTIONS = ['friendly', 'neutral', 'hostile', 'unknown'];
  const GENDER_OPTIONS = ['male', 'female', 'unknown', 'other'];

  const propertyPills: PillDef[] = [
    { key: 'role', label: 'ROLE', value: role, icon: 'badge', fieldType: 'text' },
    { key: 'species', label: 'SPECIES', value: species, icon: 'pets', fieldType: 'text' },
    { key: 'gender', label: 'GENDER', value: gender, fieldType: 'select', options: GENDER_OPTIONS },
    { key: 'threat', label: 'THREAT', value: threat, icon: 'warning', fieldType: 'select', options: THREAT_OPTIONS, color: threat ? THREAT_COLOR[threat] : undefined },
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
        <LinearGradient
          colors={[colors.cosmicContainer, colors.surfaceContainerLowest]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.portrait}
        >
          <Text style={styles.portraitInitials}>{getInitials(page.title)}</Text>
        </LinearGradient>

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
            {threat ? (
              <View style={[styles.npcStatChip, { borderColor: (THREAT_COLOR[threat] ?? colors.outline) + '44' }]}>
                <Text style={[styles.npcStatChipLabel, { color: THREAT_COLOR[threat] ?? colors.outline }]}>
                  {threat.charAt(0).toUpperCase() + threat.slice(1)} threat
                </Text>
              </View>
            ) : null}
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
