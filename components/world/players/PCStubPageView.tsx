import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  forceReleasePageEdit,
  getCampaignMembers,
  getCharacterById,
  getPagesLinkingTo,
  getEventsReferencingPage,
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
import type { Database, Json, TemplateKey, WorldPage, Dnd5eStats, Dnd5eResources, TimelineEvent } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  VisibilityBadge,
  colors,
  fonts,
  radius,
  spacing,
} from '@vaultstone/ui';

import { EditLockBanner } from '../EditLockBanner';
import { LoreCanvasEditor } from '../LoreCanvasEditor.web';
import { OrphanBanner } from '../OrphanBanner';
import { PlayerViewToggle } from '../PlayerViewToggle';
import { ShareModal } from '../ShareModal';
import { PAGE_KIND_LABEL } from '../helpers';
import { usePageVisibilityToggle } from '../usePageVisibilityToggle';
import { worldPageHref, worldSectionHref } from '../worldHref';
import {
  SideSectionHeader,
  RightTabBtn,
  HookInput,
  formatRelativeTime,
  MENTION_ICON,
  PAGE_SIDEBAR_STYLES as sideStyles,
} from '../PageSidebarShared';
import { OrphanResolveModal } from './OrphanResolveModal';

type Character = Database['public']['Tables']['characters']['Row'];
type CanvasBlock = { id: string; x: number; y: number; width: number; height?: number; html: string };
type Relationship = { targetPageId: string; type: string; note?: string };
type CampaignMember = { user_id: string; character_id: string | null; role: string; profiles: any; characters: any };

const LOCK_HEARTBEAT_MS = 30_000;
const RELATIONSHIP_TYPES = ['ally', 'rival', 'enemy', 'friend', 'family', 'lover', 'mentor', 'student', 'employer', 'servant'];
const RECIPROCAL_MAP: Record<string, string> = { ally: 'ally', rival: 'rival', enemy: 'enemy', friend: 'friend', family: 'family', lover: 'lover', employer: 'servant', servant: 'employer', mentor: 'student', student: 'mentor' };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Props = { page: WorldPage; worldId: string };

function addReciprocalRelationship(targetPage: WorldPage, sourcePageId: string, type: string) {
  const reciprocal = RECIPROCAL_MAP[type] ?? type;
  const fields = (targetPage.structured_fields as Record<string, unknown>) ?? {};
  const existing: Relationship[] = Array.isArray(fields.__relationships) ? (fields.__relationships as Relationship[]) : [];
  if (existing.some((r) => r.targetPageId === sourcePageId && r.type === reciprocal)) return;
  const next = { ...fields, __relationships: [...existing, { targetPageId: sourcePageId, type: reciprocal }] };
  usePagesStore.getState().updatePage(targetPage.id, { structured_fields: next as Json });
  void updatePage(targetPage.id, { structured_fields: next as Json });
}

function removeReciprocalRelationship(targetPage: WorldPage, sourcePageId: string) {
  const fields = (targetPage.structured_fields as Record<string, unknown>) ?? {};
  const existing: Relationship[] = Array.isArray(fields.__relationships) ? (fields.__relationships as Relationship[]) : [];
  const filtered = existing.filter((r) => r.targetPageId !== sourcePageId);
  if (filtered.length === existing.length) return;
  const next = { ...fields, __relationships: filtered };
  usePagesStore.getState().updatePage(targetPage.id, { structured_fields: next as Json });
  void updatePage(targetPage.id, { structured_fields: next as Json });
}

export function PCStubPageView({ page, worldId }: Props) {
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const linkedCampaigns = useCurrentWorldStore((s) => s.linkedCampaigns);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => worldId ? s.byWorldId[worldId] : undefined);
  const mentionablePages = useMemo(() => (allPages ?? []).filter((p) => p.id !== page.id), [allPages, page.id]);
  const sectionLabelById = useCallback((id: string) => sections.find((s) => s.id === id)?.name ?? '', [sections]);
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
  const [orphanResolveOpen, setOrphanResolveOpen] = useState(false);
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false);
  const [addingRelationship, setAddingRelationship] = useState(false);

  // Character data
  const [character, setCharacter] = useState<Character | null>(null);
  useEffect(() => {
    if (!page.character_id) return;
    let cancelled = false;
    getCharacterById(page.character_id).then(({ data }) => {
      if (!cancelled && data) setCharacter(data);
    });
    return () => { cancelled = true; };
  }, [page.character_id]);

  const stats = character?.base_stats as unknown as Dnd5eStats | null;
  const resources = character?.resources as unknown as Dnd5eResources | null;

  // Structured fields
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

  const hooks = Array.isArray(fields.__hooks) ? (fields.__hooks as string[]) : [];
  const goals = Array.isArray(fields.__goals) ? (fields.__goals as string[]) : [];
  const relationships: Relationship[] = Array.isArray(fields.__relationships) ? (fields.__relationships as Relationship[]) : [];

  // Title override
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(page.title);
  async function handleTitleSave() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === page.title) { setEditingTitle(false); return; }
    const { data } = await updatePage(page.id, { title: trimmed, title_overridden: true });
    if (data) updatePageInStore(page.id, { title: data.title, title_overridden: data.title_overridden });
    setEditingTitle(false);
  }
  async function handleTitleReset() {
    if (!character) return;
    const { data } = await updatePage(page.id, { title: character.name, title_overridden: false });
    if (data) { updatePageInStore(page.id, { title: data.title, title_overridden: data.title_overridden }); setTitleDraft(data.title); }
  }

  // Lock
  const [lockError, setLockError] = useState<{ ownerId: string; since: string } | null>(null);
  const section = useMemo(() => sections.find((s) => s.id === page.section_id) ?? null, [sections, page]);
  const lockOwnerId = page.editing_user_id ?? null;
  const lockSince = page.editing_since ?? null;
  const lockFresh = lockSince !== null && Date.now() - Date.parse(lockSince) < 90_000;
  const heldByOther = lockFresh && lockOwnerId !== null && myUserId !== null && lockOwnerId !== myUserId;
  const bannerLock = heldByOther ? { ownerId: lockOwnerId as string, since: lockSince as string } : lockError;
  const lockCtxRef = useRef({ lockOwnerId, lockSince, myUserId, updatePageInStore });
  lockCtxRef.current = { lockOwnerId, lockSince, myUserId, updatePageInStore };

  const tryClaim = useCallback(async () => {
    if (!page.id) return;
    const { data, error } = await claimPageEdit(page.id);
    const ctx = lockCtxRef.current;
    if (error) { setLockError({ ownerId: ctx.lockOwnerId ?? 'unknown', since: ctx.lockSince ?? new Date().toISOString() }); return; }
    if (data) { ctx.updatePageInStore(data.id, { editing_user_id: data.editing_user_id, editing_since: data.editing_since }); setLockError(null); }
  }, [page.id]);

  useEffect(() => {
    void tryClaim();
    const t = setInterval(() => void tryClaim(), LOCK_HEARTBEAT_MS);
    return () => {
      clearInterval(t);
      if (bodyTimerRef.current) {
        clearTimeout(bodyTimerRef.current); bodyTimerRef.current = null;
        const pending = pendingBodyRef.current;
        if (pending) { pendingBodyRef.current = null; void updatePage(page.id, { body: pending.body as unknown as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs }); }
      }
      void releasePageEdit(page.id);
    };
  }, [page.id, tryClaim]);

  async function flushAndNavigate(targetId: string) {
    if (bodyTimerRef.current) { clearTimeout(bodyTimerRef.current); bodyTimerRef.current = null; }
    const pending = pendingBodyRef.current;
    if (pending) { pendingBodyRef.current = null; await updatePage(page.id, { body: pending.body as unknown as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs }); }
    router.push(worldPageHref(worldId, targetId));
  }

  function handleCanvasChange(blocks: CanvasBlock[], plainText: string, bodyRefs?: string[]) {
    if (heldByOther) return;
    const body = { __canvas_blocks: blocks };
    pendingBodyRef.current = { body, bodyText: plainText, bodyRefs: bodyRefs ?? [] };
    setSaveState('saving');
    if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current);
    bodyTimerRef.current = setTimeout(async () => {
      const pending = pendingBodyRef.current;
      if (!pending) return;
      pendingBodyRef.current = null;
      const { data, error } = await updatePage(page.id, { body: pending.body as unknown as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs });
      if (error || !data) { setSaveState('error'); return; }
      updatePageInStore(page.id, { body: data.body, body_text: data.body_text, body_refs: data.body_refs });
      setSaveState('saved');
    }, 800);
  }

  async function handleDeletePage() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await trashPage(page.id); removePage(page.id);
    router.replace(worldSectionHref(worldId, page.section_id));
  }

  const template = getTemplate(page.template_key as TemplateKey, page.template_version);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Player character';
  const isOrphan = page.is_orphaned;

  // Right sidebar data
  const [rightTab, setRightTab] = useState<'info' | 'sub'>('info');
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const subpages = useMemo(() => (allPages ?? []).filter((p) => p.parent_page_id === page.id).sort((a, b) => a.sort_order - b.sort_order), [allPages, page.id]);
  const [backlinks, setBacklinks] = useState<WorldPage[]>([]);
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);
  useEffect(() => { let c = false; setBacklinksLoaded(false); void (async () => { const { data } = await getPagesLinkingTo(worldId, page.id); if (!c) { setBacklinks(data ?? []); setBacklinksLoaded(true); } })(); return () => { c = true; }; }, [page.id, worldId]);
  const [seenInPlay, setSeenInPlay] = useState<TimelineEvent[]>([]);
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => { let c = false; setSeenLoaded(false); void (async () => { const { data } = await getEventsReferencingPage(worldId, page.id); if (!c) { setSeenInPlay((data ?? []) as TimelineEvent[]); setSeenLoaded(true); } })(); return () => { c = true; }; }, [page.id, worldId]);

  const mentionedPages = useMemo(() => {
    const refs = page.body_refs ?? [];
    if (!refs.length || !allPages) return [];
    const map = new Map(allPages.map((p) => [p.id, p]));
    return refs.map((id) => map.get(id)).filter((p): p is WorldPage => !!p);
  }, [page.body_refs, allPages]);

  const npcLocations = useMemo(() => {
    return (allPages ?? []).filter((p) => p.page_kind === 'location' && (p.body_refs ?? []).includes(page.id));
  }, [allPages, page.id]);

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Error' : null;

  return (
    <View style={styles.root}>
      {/* Breadcrumb bar */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Icon name="person" size={18} color={colors.player} />
          <Pressable onPress={() => router.push(worldSectionHref(worldId, page.section_id))}>
            <Text style={styles.crumb}>{section?.name?.toUpperCase() ?? 'PLAYERS'}</Text>
          </Pressable>
          <Text style={styles.crumbSep}>/</Text>
          <Text style={styles.crumbActive}>{page.title.toUpperCase()}</Text>
        </View>
        <View style={styles.topBarRight}>
          <PlayerViewToggle />
          {isWorldOwner ? (
            <>
              <Pressable onPress={() => setShareOpen(true)} style={styles.shareBtn}>
                <Icon name="share" size={14} color={colors.onSurfaceVariant} />
                <Text variant="label-md" uppercase weight="semibold" style={{ color: colors.onSurfaceVariant, letterSpacing: 1, fontSize: 11 }}>Share</Text>
              </Pressable>
              <Pressable onPress={handleDeletePage} accessibilityLabel="Delete page" hitSlop={8}>
                <Icon name="delete-outline" size={18} color={confirmDelete ? colors.hpDanger : colors.outlineVariant} />
              </Pressable>
            </>
          ) : null}
          <VisibilityBadge visibility={page.visible_to_players ? 'player' : 'gm'} interactive={!!toggleVisibility} onPress={toggleVisibility ?? undefined} />
        </View>
      </View>

      {confirmDelete ? (
        <View style={styles.deleteBanner}>
          <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>Delete this page? Recoverable for 30 days.</Text>
          <Pressable onPress={() => setConfirmDelete(false)} style={styles.deleteBannerBtn}>
            <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleDeletePage} style={[styles.deleteBannerBtn, styles.deleteBannerConfirm]}>
            <Icon name="delete" size={14} color={colors.hpDanger} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>Confirm</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Main area */}
      <View style={styles.mainWrap}>
        <View style={styles.editorCol}>
          {/* Title row */}
          <View style={styles.titleRow}>
            <Icon name="person" size={28} color={colors.player} />
            <View style={{ flex: 1 }}>
              {editingTitle ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                  <Input value={titleDraft} onChangeText={setTitleDraft} onSubmitEditing={handleTitleSave} autoFocus style={{ flex: 1 }} />
                  <GhostButton label="Save" onPress={handleTitleSave} />
                  <GhostButton label="Cancel" onPress={() => { setEditingTitle(false); setTitleDraft(page.title); }} />
                </View>
              ) : (
                <View>
                  <Text variant="headline-md" family="serif-display" weight="bold">{page.title}</Text>
                  {stats ? (
                    <Text variant="body-sm" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
                      {[stats.speciesKey?.replace(/-/g, ' '), stats.classKey?.replace(/-/g, ' '), stats.level ? `Level ${stats.level}` : null].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
            {isWorldOwner && !editingTitle && !heldByOther ? (
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                <Pressable onPress={() => setEditingTitle(true)} style={styles.titleBtn}>
                  <Icon name="edit" size={12} color={colors.onSurfaceVariant} />
                </Pressable>
                {page.title_overridden && character ? (
                  <Pressable onPress={handleTitleReset} style={styles.titleBtn}>
                    <Icon name="refresh" size={12} color={colors.outline} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {isOrphan ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
              <OrphanBanner page={page} />
              {isWorldOwner ? (
                <Pressable onPress={() => setOrphanResolveOpen(true)} style={styles.resolveBtn}>
                  <Icon name="build" size={12} color={colors.player} />
                  <Text variant="label-sm" weight="semibold" style={{ color: colors.player }}>Resolve orphan</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {bannerLock ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
              <EditLockBanner ownerUserId={bannerLock.ownerId} lockedSinceIso={bannerLock.since} onRetry={tryClaim} onForceUnlock={isWorldOwner ? async () => { await forceReleasePageEdit(page.id); updatePageInStore(page.id, { editing_user_id: null, editing_since: null }); void tryClaim(); } : undefined} />
            </View>
          ) : null}

          {/* Character link card */}
          <View style={styles.charSection}>
            {character && stats ? (
              <Card tier="container" style={styles.charCard}>
                <View style={styles.charCardRow}>
                  <Icon name="person" size={20} color={colors.player} />
                  <View style={{ flex: 1 }}>
                    <Text variant="body-md" weight="semibold">{character.name}</Text>
                    <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                      {[stats.speciesKey?.replace(/-/g, ' '), stats.classKey?.replace(/-/g, ' '), `Lv ${stats.level ?? 1}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={styles.charStatChips}>
                    <View style={styles.charStatChip}>
                      <Text style={styles.charStatValue}>HP {resources?.hpCurrent ?? 0}/{stats.hpMax}</Text>
                    </View>
                    <View style={styles.charStatChip}>
                      <Text style={styles.charStatValue}>AC {computeAC(stats, resources)}</Text>
                    </View>
                  </View>
                  <GhostButton label="Open Sheet" icon="open-in-new" onPress={() => router.push(`/character/${page.character_id}`)} />
                </View>
              </Card>
            ) : isWorldOwner && linkedCampaigns.length > 0 && !page.character_id ? (
              <Pressable onPress={() => setCharacterPickerOpen(true)} style={styles.linkCharBtn}>
                <Icon name="person-add" size={16} color={colors.player} />
                <Text variant="body-sm" weight="semibold" style={{ color: colors.player }}>Link a character from campaign</Text>
              </Pressable>
            ) : !page.character_id ? (
              <View style={styles.linkCharBtn}>
                <Icon name="person-off" size={16} color={colors.outline} />
                <Text variant="body-sm" style={{ color: colors.outline }}>No linked character</Text>
              </View>
            ) : null}
          </View>

          {/* Canvas editor */}
          <View style={[{ flex: 1 }, heldByOther ? styles.disabledEditor : undefined]} pointerEvents={heldByOther ? 'none' : 'auto'}>
            <LoreCanvasEditor
              initialBlocks={(page.body as Record<string, unknown>)?.__canvas_blocks as CanvasBlock[] | null ?? null}
              onChange={handleCanvasChange}
              editable={!heldByOther}
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
        {rightCollapsed ? (
          <View style={sideStyles.rightPanelCollapsed}>
            <Pressable onPress={() => setRightCollapsed(false)} style={sideStyles.rightPanelToggleBtn}>
              <Icon name="chevron-left" size={14} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
        ) : (
          <View style={sideStyles.rightPanel}>
            <View style={sideStyles.rightPanelTopRow}>
              <Pressable onPress={() => setRightCollapsed(true)} style={sideStyles.rightPanelToggleBtn}>
                <Icon name="chevron-right" size={14} color={colors.outline} />
              </Pressable>
            </View>
            <View style={sideStyles.rightTabs}>
              <RightTabBtn label="On This Page" active={rightTab === 'info'} onPress={() => setRightTab('info')} />
              <RightTabBtn label="Sub-pages" active={rightTab === 'sub'} onPress={() => setRightTab('sub')} />
            </View>
            <ScrollView contentContainerStyle={sideStyles.rightBody}>
              {rightTab === 'info' ? (
                <>
                  {/* Mentioned on this page */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="alternate-email" title="MENTIONED ON THIS PAGE" count={mentionedPages.length || undefined} />
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
                  </View>

                  {/* Locations */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="place" title="LOCATIONS" count={npcLocations.length || undefined} />
                    {npcLocations.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No locations linked yet.</Text>
                    ) : npcLocations.map((loc) => (
                      <Pressable key={loc.id} onPress={() => router.push(worldPageHref(worldId, loc.id))} style={sideStyles.mentionRow}>
                        <View style={[sideStyles.mentionDot, { backgroundColor: colors.primary }]} />
                        <View style={{ flex: 1 }}>
                          <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{loc.title}</Text>
                          <Text style={sideStyles.mentionMeta}>LOCATION</Text>
                        </View>
                        <Icon name="chevron-right" size={12} color={colors.outline} />
                      </Pressable>
                    ))}
                  </View>

                  {/* Linked from */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="link" title="LINKED FROM" count={backlinksLoaded && backlinks.length > 0 ? backlinks.length : undefined} />
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
                  </View>

                  {/* Seen in play */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="history" title="SEEN IN PLAY" count={seenLoaded && seenInPlay.length > 0 ? seenInPlay.length : undefined} />
                    {seenLoaded && seenInPlay.length === 0 ? (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No session references yet.</Text>
                    ) : seenInPlay.slice(0, 5).map((evt) => (
                      <View key={evt.id} style={sideStyles.seenRow}>
                        <View style={sideStyles.seenHeader}>
                          <View style={sideStyles.seenBadge}><Text style={sideStyles.seenBadgeText}>{evt.source_session_id ? 'S' : 'E'}</Text></View>
                          <Text style={sideStyles.seenAgo}>{formatRelativeTime(evt.created_at)}</Text>
                        </View>
                        <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 12 }}>{evt.title}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Relationships */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="people" title="RELATIONSHIPS" count={relationships.length || undefined} />
                    {relationships.map((rel, i) => {
                      const targetPage = (allPages ?? []).find((p) => p.id === rel.targetPageId);
                      if (!targetPage) return null;
                      return (
                        <View key={`${rel.targetPageId}-${i}`} style={styles.relRow}>
                          <Pressable onPress={() => router.push(worldPageHref(worldId, rel.targetPageId))} style={styles.relLink}>
                            <View style={[sideStyles.mentionDot, { backgroundColor: colors.cosmic }]} />
                            <View style={{ flex: 1 }}>
                              <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{targetPage.title}</Text>
                              <Text style={sideStyles.mentionMeta}>{rel.type.toUpperCase()}</Text>
                            </View>
                            <Icon name="chevron-right" size={12} color={colors.outline} />
                          </Pressable>
                          <Pressable onPress={() => { updateField('__relationships', relationships.filter((_, j) => j !== i)); if (targetPage) removeReciprocalRelationship(targetPage, page.id); }} style={{ padding: 4 }}>
                            <Icon name="close" size={12} color={colors.outline} />
                          </Pressable>
                        </View>
                      );
                    })}
                    <Pressable onPress={() => setAddingRelationship(true)} style={styles.addRelBtn}>
                      <Icon name="add" size={14} color={colors.outline} />
                      <Text style={{ fontFamily: 'Manrope', fontSize: 11, color: colors.outline }}>Add relationship</Text>
                    </Pressable>
                  </View>

                  {/* Goals */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="flag" title="GOALS" count={goals.length || undefined} />
                    {goals.map((goal, i) => (
                      <View key={i} style={sideStyles.hookRow}>
                        <Text style={sideStyles.hookBullet}>•</Text>
                        <Text variant="body-sm" style={{ flex: 1, color: colors.onSurfaceVariant, fontSize: 12 }}>{goal}</Text>
                        <Pressable onPress={() => updateField('__goals', goals.filter((_, j) => j !== i))} style={{ padding: 2 }}>
                          <Icon name="close" size={12} color={colors.outline} />
                        </Pressable>
                      </View>
                    ))}
                    <HookInput onAdd={(text) => updateField('__goals', [...goals, text])} placeholder="Add a goal or motivation" />
                  </View>

                  {/* Hooks & Rumors */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="lightbulb" title="HOOKS & RUMORS" count={hooks.length || undefined} />
                    {hooks.map((hook, i) => (
                      <View key={i} style={sideStyles.hookRow}>
                        <Text style={sideStyles.hookBullet}>•</Text>
                        <Text variant="body-sm" style={{ flex: 1, color: colors.onSurfaceVariant, fontSize: 12 }}>{hook}</Text>
                        <Pressable onPress={() => updateField('__hooks', hooks.filter((_, j) => j !== i))} style={{ padding: 2 }}>
                          <Icon name="close" size={12} color={colors.outline} />
                        </Pressable>
                      </View>
                    ))}
                    <HookInput onAdd={(text) => updateField('__hooks', [...hooks, text])} />
                  </View>
                </>
              ) : (
                <View style={sideStyles.sideSection}>
                  <SideSectionHeader icon="subdirectory-arrow-right" title="SUB-PAGES" count={subpages.length || undefined} />
                  {subpages.length === 0 ? (
                    <Text variant="body-sm" style={sideStyles.emptyText}>No sub-pages yet.</Text>
                  ) : subpages.map((sp) => (
                    <Pressable key={sp.id} onPress={() => router.push(worldPageHref(worldId, sp.id))} style={sideStyles.mentionRow}>
                      <View style={{ flex: 1 }}>
                        <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{sp.title}</Text>
                      </View>
                      <Icon name="chevron-right" size={12} color={colors.outline} />
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
      {orphanResolveOpen ? <OrphanResolveModal page={page} worldId={worldId} onClose={() => setOrphanResolveOpen(false)} /> : null}
      {characterPickerOpen ? <CharacterPickerModal campaigns={linkedCampaigns} onSelect={async (charId) => {
        setCharacterPickerOpen(false);
        const { data } = await updatePage(page.id, { character_id: charId } as any);
        if (data) { updatePageInStore(page.id, { character_id: charId } as any); getCharacterById(charId).then(({ data: ch }) => { if (ch) setCharacter(ch); }); }
      }} onClose={() => setCharacterPickerOpen(false)} /> : null}
      {addingRelationship ? <AddRelationshipModal
        allPages={allPages ?? []}
        currentPageId={page.id}
        existingRelationships={relationships}
        onAdd={(rel) => {
          updateField('__relationships', [...relationships, rel]);
          const target = (allPages ?? []).find((p) => p.id === rel.targetPageId);
          if (target) addReciprocalRelationship(target, page.id, rel.type);
          setAddingRelationship(false);
        }}
        onClose={() => setAddingRelationship(false)}
      /> : null}
    </View>
  );
}

// ── Character Picker Modal ────────────────────────────────────────────

function CharacterPickerModal({ campaigns, onSelect, onClose }: {
  campaigns: any[];
  onSelect: (characterId: string) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(campaigns.map((c) => getCampaignMembers(c.id)));
      if (cancelled) return;
      const all: CampaignMember[] = [];
      for (const r of results) {
        for (const m of (r.data ?? []) as any[]) {
          if (m.character_id && m.characters) all.push(m);
        }
      }
      setMembers(all);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [campaigns]);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={pickerStyles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={pickerStyles.wrapper}>
          <View style={pickerStyles.card}>
            <View style={pickerStyles.header}>
              <Icon name="person-add" size={18} color={colors.player} />
              <Text variant="title-md" family="serif-display" weight="semibold" style={{ flex: 1 }}>Link Character</Text>
              <Pressable onPress={onClose}><Icon name="close" size={18} color={colors.onSurfaceVariant} /></Pressable>
            </View>
            {loading ? (
              <Text variant="body-sm" style={{ color: colors.outline, padding: spacing.md }}>Loading characters…</Text>
            ) : members.length === 0 ? (
              <Text variant="body-sm" style={{ color: colors.outline, padding: spacing.md }}>No characters found in linked campaigns.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 300 }}>
                {members.map((m) => {
                  const ch = m.characters;
                  const stats = ch?.base_stats as Dnd5eStats | null;
                  return (
                    <Pressable key={m.character_id} onPress={() => onSelect(m.character_id!)} style={pickerStyles.row}>
                      <Icon name="person" size={16} color={colors.player} />
                      <View style={{ flex: 1 }}>
                        <Text variant="body-sm" weight="semibold">{ch?.name ?? 'Unknown'}</Text>
                        {stats ? <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                          {[stats.speciesKey?.replace(/-/g, ' '), stats.classKey?.replace(/-/g, ' '), `Lv ${stats.level ?? 1}`].filter(Boolean).join(' · ')}
                        </Text> : null}
                      </View>
                      <Icon name="chevron-right" size={14} color={colors.outline} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Add Relationship Modal ────────────────────────────────────────────

function AddRelationshipModal({ allPages, currentPageId, existingRelationships, onAdd, onClose }: {
  allPages: WorldPage[];
  currentPageId: string;
  existingRelationships: Relationship[];
  onAdd: (rel: Relationship) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [relType, setRelType] = useState('ally');
  const existingIds = new Set(existingRelationships.map((r) => r.targetPageId));
  const candidates = allPages
    .filter((p) => ['npc', 'pc_stub', 'player_character', 'faction'].includes(p.page_kind) && p.id !== currentPageId && !existingIds.has(p.id))
    .filter((p) => !search || p.title.toLowerCase().includes(search.toLowerCase()));
  const selectedPage = selectedPageId ? allPages.find((p) => p.id === selectedPageId) : null;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={pickerStyles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={pickerStyles.wrapper}>
          <View style={pickerStyles.card}>
            <View style={pickerStyles.header}>
              <Icon name="people" size={18} color={colors.cosmic} />
              <Text variant="title-md" family="serif-display" weight="semibold" style={{ flex: 1 }}>Add Relationship</Text>
              <Pressable onPress={onClose}><Icon name="close" size={18} color={colors.onSurfaceVariant} /></Pressable>
            </View>
            {!selectedPageId ? (
              <>
                <input type="text" value={search} onChange={(e: any) => setSearch(e.target.value)} autoFocus placeholder="Search pages…" style={{ width: '100%', background: colors.surfaceContainerLowest, border: `1px solid ${colors.outlineVariant}44`, borderRadius: 8, padding: '8px 12px', color: colors.onSurface, fontSize: 13, fontFamily: "'Manrope', system-ui, sans-serif", outline: 'none', marginBottom: 8 }} />
                <ScrollView style={{ maxHeight: 240 }}>
                  {candidates.length === 0 ? (
                    <Text variant="body-sm" style={{ color: colors.outline, padding: 8, fontStyle: 'italic' }}>No matching pages.</Text>
                  ) : candidates.map((p) => (
                    <Pressable key={p.id} onPress={() => setSelectedPageId(p.id)} style={pickerStyles.row}>
                      <Icon name="person" size={14} color={colors.cosmic} />
                      <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>{p.title}</Text>
                      <Icon name="chevron-right" size={12} color={colors.outline} />
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                  <Icon name="person" size={16} color={colors.cosmic} />
                  <Text variant="body-md" weight="semibold" style={{ flex: 1 }}>{selectedPage?.title}</Text>
                  <Pressable onPress={() => setSelectedPageId(null)} style={{ padding: 4 }}><Icon name="close" size={14} color={colors.outline} /></Pressable>
                </View>
                <Text variant="label-sm" uppercase style={{ color: colors.outline, letterSpacing: 1, marginBottom: 6 }}>Relationship type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {RELATIONSHIP_TYPES.map((t) => (
                    <Pressable key={t} onPress={() => setRelType(t)} style={[pickerStyles.typeChip, relType === t && pickerStyles.typeChipActive]}>
                      <Text variant="label-sm" style={{ color: relType === t ? colors.primary : colors.onSurfaceVariant, textTransform: 'capitalize' }}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.lg }}>
                  <GhostButton label="Cancel" onPress={onClose} />
                  <GradientButton label="Add" onPress={() => onAdd({ targetPageId: selectedPageId, type: relType })} />
                </View>
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function computeAC(stats: Dnd5eStats, resources: Dnd5eResources | null): number {
  const dexMod = Math.floor(((stats.abilityScores?.dexterity ?? 10) - 10) / 2);
  const equipment: any[] = resources?.equipment ?? [];
  const armor = equipment.find((e) => e.slot === 'armor' && e.equipped);
  const shield = equipment.find((e) => e.slot === 'shield' && e.equipped);
  let ac = 10 + dexMod;
  if (armor) { ac = armor.acBase ?? 10; if (armor.dexCap == null) ac += dexMod; else ac += Math.min(dexMod, armor.dexCap); }
  if (shield) ac += shield.acBonus ?? 2;
  return ac;
}

// ── Styles ────────────────────────────────────────────────────────────

const pickerStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12, 14, 16, 0.7)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  wrapper: { width: '100%', maxWidth: 440 },
  card: { backgroundColor: colors.surfaceContainer, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.outlineVariant + '33', padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: radius.lg },
  typeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  typeChipActive: { backgroundColor: colors.primaryContainer + '33', borderColor: colors.primary + '66' },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '22' },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  crumb: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, color: colors.outline, cursor: 'pointer' as any },
  crumbSep: { fontFamily: fonts.label, fontSize: 11, color: colors.outlineVariant, marginHorizontal: 4 },
  crumbActive: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, color: colors.onSurfaceVariant },
  mainWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },
  editorCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  titleBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  charSection: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  charCard: { borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.xl },
  charCardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  charStatChips: { flexDirection: 'row', gap: 6 },
  charStatChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  charStatValue: { fontFamily: fonts.label, fontSize: 11, color: colors.onSurfaceVariant },
  linkCharBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.player + '33', borderStyle: 'dashed' as any },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.player + '44', alignSelf: 'flex-start' },
  relRow: { flexDirection: 'row', alignItems: 'center' },
  relLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.lg },
  addRelBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 6 },
  disabledEditor: { opacity: 0.55 },
  saveIndicator: { position: 'absolute', bottom: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceContainerHigh + 'dd', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  saveDot: { width: 6, height: 6, borderRadius: 3 },
  saveText: { fontFamily: fonts.label, fontSize: 11, color: colors.outline },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  deleteBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerContainer + '44', borderBottomWidth: 1, borderBottomColor: colors.hpDanger + '33' },
  deleteBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.lg },
  deleteBannerConfirm: { borderWidth: 1, borderColor: colors.hpDanger + '55' },
});
