import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  forceReleasePageEdit,
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
import type { Database, Json, TemplateKey, WorldPage, Dnd5eStats, Dnd5eResources, Dnd5eEquipmentItem, TimelineEvent } from '@vaultstone/types';
import {
  Card,
  GhostButton,
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
  formatRelativeTime,
  PAGE_SIDEBAR_STYLES as sideStyles,
} from '../PageSidebarShared';
import { OrphanResolveModal } from './OrphanResolveModal';

type Character = Database['public']['Tables']['characters']['Row'];
type CanvasBlock = { id: string; x: number; y: number; width: number; height?: number; html: string };

const LOCK_HEARTBEAT_MS = 30_000;
const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
const ABILITY_ABBR: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};
function mod(val: number): string {
  const m = Math.floor((val - 10) / 2);
  return (m >= 0 ? '+' : '') + m;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = { page: WorldPage; worldId: string };

export function PCStubPageView({ page, worldId }: Props) {
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => worldId ? s.byWorldId[worldId] : undefined);
  const mentionablePages = useMemo(
    () => (allPages ?? []).filter((p) => p.id !== page.id),
    [allPages, page.id],
  );
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
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [orphanResolveOpen, setOrphanResolveOpen] = useState(false);

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
  const conditions = character?.conditions ?? [];

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
    if (error) {
      setLockError({ ownerId: ctx.lockOwnerId ?? 'unknown', since: ctx.lockSince ?? new Date().toISOString() });
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
        if (pending) { pendingBodyRef.current = null; void updatePage(page.id, { body: pending.body as unknown as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs }); }
      }
      void releasePageEdit(page.id);
    };
  }, [page.id, tryClaim]);

  // Canvas body save
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
      const { data, error } = await updatePage(page.id, {
        body: pending.body as unknown as Json,
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
          {/* Title row with rename controls */}
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

          {/* Character stats hero — collapsible */}
          {character && stats ? (
            <View style={styles.heroSection}>
              <Pressable onPress={() => setStatsCollapsed(!statsCollapsed)} style={styles.heroToggle}>
                <Icon name="person" size={14} color={colors.player} />
                <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.player, letterSpacing: 1, flex: 1 }}>
                  Character Stats
                </Text>
                {statsCollapsed ? (
                  <View style={styles.heroCollapsedSummary}>
                    <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                      HP {resources?.hpCurrent ?? 0}/{stats.hpMax} · AC {computeAC(stats, resources)} · Lv {stats.level ?? 1}
                    </Text>
                  </View>
                ) : null}
                <Icon name={statsCollapsed ? 'expand-more' : 'expand-less'} size={18} color={colors.outline} />
              </Pressable>
              {!statsCollapsed ? (
                <View style={styles.heroCardWrap}>
                  <CharacterStatsHero stats={stats} resources={resources} conditions={conditions} />
                </View>
              ) : null}
            </View>
          ) : !page.character_id ? (
            <View style={styles.heroSection}>
              <Card tier="container" padding="lg" style={{ alignItems: 'center', borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.xl, maxWidth: 480 }}>
                <Icon name="person-off" size={24} color={colors.outlineVariant} />
                <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.xs }}>No linked character — standalone player page.</Text>
              </Card>
            </View>
          ) : null}

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

        {/* Right sidebar */}
        {rightCollapsed ? (
          <Pressable onPress={() => setRightCollapsed(false)} style={sideStyles.rightPanelCollapsed}>
            <View style={sideStyles.rightPanelToggleBtn}>
              <Icon name="chevron-left" size={16} color={colors.outline} />
            </View>
          </Pressable>
        ) : (
          <View style={sideStyles.rightPanel}>
            <View style={sideStyles.rightTabs}>
              <RightTabBtn label="Info" active={rightTab === 'info'} onPress={() => setRightTab('info')} />
              <RightTabBtn label="Sub-pages" active={rightTab === 'sub'} onPress={() => setRightTab('sub')} />
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setRightCollapsed(true)} hitSlop={8} style={{ justifyContent: 'center' }}>
                <Icon name="chevron-right" size={16} color={colors.outline} />
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={sideStyles.rightBody}>
              {rightTab === 'info' ? (
                <>
                  {mentionedPages.length > 0 ? (
                    <View style={sideStyles.sideSection}>
                      <SideSectionHeader icon="link" title="Mentioned On This Page" count={mentionedPages.length} />
                      {mentionedPages.map((p) => (
                        <Pressable key={p.id} onPress={() => router.push(worldPageHref(worldId, p.id))} style={sideStyles.mentionRow}>
                          <Text variant="body-sm" numberOfLines={1} style={{ color: colors.primary, flex: 1 }}>{p.title}</Text>
                          <Text variant="label-sm" style={{ color: colors.outline }}>{PAGE_KIND_LABEL[p.page_kind] ?? p.page_kind}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {seenLoaded && seenInPlay.length > 0 ? (
                    <View style={sideStyles.sideSection}>
                      <SideSectionHeader icon="timeline" title="Seen in Play" count={seenInPlay.length} />
                      {seenInPlay.slice(0, 8).map((ev) => (
                        <View key={ev.id} style={sideStyles.mentionRow}>
                          <Text variant="body-sm" numberOfLines={1} style={{ color: colors.onSurface, flex: 1 }}>{ev.title}</Text>
                          <Text variant="label-sm" style={{ color: colors.outline }}>{formatRelativeTime(ev.created_at)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {backlinksLoaded && backlinks.length > 0 ? (
                    <View style={sideStyles.sideSection}>
                      <SideSectionHeader icon="link" title="Linked From" count={backlinks.length} />
                      {backlinks.map((bl) => (
                        <Pressable key={bl.id} onPress={() => router.push(worldPageHref(worldId, bl.id))} style={sideStyles.mentionRow}>
                          <Text variant="body-sm" numberOfLines={1} style={{ color: colors.primary, flex: 1 }}>{bl.title}</Text>
                          <Text variant="label-sm" style={{ color: colors.outline }}>{PAGE_KIND_LABEL[bl.page_kind] ?? bl.page_kind}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={sideStyles.sideSection}>
                  <SideSectionHeader icon="subdirectory-arrow-right" title="Sub-pages" count={subpages.length} />
                  {subpages.map((sp) => (
                    <Pressable key={sp.id} onPress={() => router.push(worldPageHref(worldId, sp.id))} style={sideStyles.mentionRow}>
                      <Text variant="body-sm" numberOfLines={1} style={{ color: colors.primary, flex: 1 }}>{sp.title}</Text>
                    </Pressable>
                  ))}
                  {subpages.length === 0 ? (
                    <Text variant="body-sm" style={{ color: colors.outline, fontStyle: 'italic' }}>No sub-pages</Text>
                  ) : null}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
      {orphanResolveOpen ? <OrphanResolveModal page={page} worldId={worldId} onClose={() => setOrphanResolveOpen(false)} /> : null}
    </View>
  );
}

// ── Character Stats Hero ──────────────────────────────────────────────

function CharacterStatsHero({ stats, resources, conditions }: {
  stats: Dnd5eStats;
  resources: Dnd5eResources | null;
  conditions: string[];
}) {
  const hpCurrent = resources?.hpCurrent ?? 0;
  const hpMax = stats.hpMax || 1;
  const hpPct = Math.round((hpCurrent / hpMax) * 100);
  const hpColor = hpPct < 30 ? colors.hpDanger : hpPct < 60 ? colors.hpWarning : colors.hpHealthy;
  const ac = computeAC(stats, resources);
  const dexMod = Math.floor(((stats.abilityScores?.dexterity ?? 10) - 10) / 2);
  const initMod = dexMod;
  const profBonus = (stats as any).proficiencyBonus ?? Math.floor((stats.level ?? 1) / 4) + 2;

  return (
    <Card tier="container" style={heroStyles.card}>
      {/* HP row */}
      <View style={heroStyles.hpRow}>
        <Icon name="favorite" size={16} color={hpColor} />
        <Text style={[heroStyles.hpValue, { color: hpColor }]}>{hpCurrent}</Text>
        <Text style={heroStyles.hpMax}>/ {hpMax}</Text>
        <View style={{ flex: 1 }} />
        {(resources?.hpTemp ?? 0) > 0 ? (
          <View style={heroStyles.tempBadge}>
            <Text style={heroStyles.tempText}>+{resources!.hpTemp} temp</Text>
          </View>
        ) : null}
      </View>
      <View style={heroStyles.hpBarTrack}>
        <View style={[heroStyles.hpBarFill, { width: `${Math.min(hpPct, 100)}%`, backgroundColor: hpColor }]} />
      </View>

      {/* Stat grid */}
      <View style={heroStyles.statGrid}>
        <View style={heroStyles.statCell}>
          <Text style={heroStyles.statValue}>{ac}</Text>
          <Text style={heroStyles.statLabel}>ARMOR CLASS</Text>
        </View>
        <View style={[heroStyles.statCell, heroStyles.statCellBorder]}>
          <Text style={heroStyles.statValue}>{stats.speed ?? 30} ft</Text>
          <Text style={heroStyles.statLabel}>SPEED</Text>
        </View>
        <View style={[heroStyles.statCell, heroStyles.statCellBorder]}>
          <Text style={heroStyles.statValue}>{initMod >= 0 ? '+' : ''}{initMod}</Text>
          <Text style={heroStyles.statLabel}>INITIATIVE</Text>
        </View>
        <View style={[heroStyles.statCell, heroStyles.statCellBorder]}>
          <Text style={heroStyles.statValue}>+{profBonus}</Text>
          <Text style={heroStyles.statLabel}>PROF</Text>
        </View>
      </View>

      {/* Ability scores */}
      <View style={heroStyles.abilRow}>
        {ABILITY_KEYS.map((key) => {
          const val = stats.abilityScores?.[key] ?? 10;
          const isSave = stats.savingThrowProficiencies?.includes(key);
          return (
            <View key={key} style={heroStyles.abilCell}>
              {isSave ? <View style={heroStyles.saveDot} /> : null}
              <Text style={heroStyles.abilLabel}>{ABILITY_ABBR[key]}</Text>
              <Text style={heroStyles.abilValue}>{val}</Text>
              <Text style={heroStyles.abilMod}>{mod(val)}</Text>
            </View>
          );
        })}
      </View>

      {/* Conditions */}
      {conditions.length > 0 ? (
        <View style={heroStyles.condRow}>
          <Text style={heroStyles.condLabel}>CONDITIONS</Text>
          <View style={heroStyles.condChips}>
            {conditions.map((c) => (
              <View key={c} style={heroStyles.condChip}>
                <Text style={heroStyles.condChipText}>{c}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

function computeAC(stats: Dnd5eStats, resources: Dnd5eResources | null): number {
  const dexMod = Math.floor(((stats.abilityScores?.dexterity ?? 10) - 10) / 2);
  const equipment: Dnd5eEquipmentItem[] = resources?.equipment ?? [];
  const armor = equipment.find((e) => e.slot === 'armor' && e.equipped);
  const shield = equipment.find((e) => e.slot === 'shield' && e.equipped);
  let ac = 10 + dexMod;
  if (armor) {
    ac = armor.acBase ?? 10;
    if (armor.dexCap === null || armor.dexCap === undefined) ac += dexMod;
    else ac += Math.min(dexMod, armor.dexCap);
  }
  if (shield) ac += shield.acBonus ?? 2;
  return ac;
}

// ── Styles ────────────────────────────────────────────────────────────

const heroStyles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.xl, overflow: 'hidden' },
  hpRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  hpValue: { fontFamily: fonts.headline, fontSize: 28, fontWeight: '600' },
  hpMax: { fontFamily: fonts.headline, fontSize: 16, color: colors.outline },
  tempBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.player + '22', borderWidth: 1, borderColor: colors.player + '44' },
  tempText: { fontFamily: fonts.label, fontSize: 11, color: colors.player },
  hpBarTrack: { height: 6, backgroundColor: colors.surfaceContainerHighest, marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: 3, overflow: 'hidden' },
  hpBarFill: { height: '100%', borderRadius: 3 },
  statGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.outlineVariant, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  statCell: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statCellBorder: { borderLeftWidth: 1, borderLeftColor: colors.outlineVariant },
  statValue: { fontFamily: fonts.headline, fontSize: 18, fontWeight: '500', color: colors.onSurface },
  statLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.2, color: colors.outline, marginTop: 2 },
  abilRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  abilCell: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRightWidth: 1, borderRightColor: colors.outlineVariant },
  saveDot: { position: 'absolute', top: 5, right: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  abilLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.4, color: colors.outline },
  abilValue: { fontFamily: fonts.headline, fontSize: 18, fontWeight: '500', color: colors.onSurface, marginTop: 2 },
  abilMod: { fontFamily: fonts.label, fontSize: 11, color: colors.onSurfaceVariant, marginTop: 1 },
  condRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: spacing.md },
  condLabel: { fontFamily: fonts.label, fontSize: 9, letterSpacing: 1.2, color: colors.outline },
  condChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  condChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hpWarning },
  condChipText: { fontFamily: fonts.label, fontSize: 11, color: colors.hpWarning },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '22' },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  crumb: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, color: colors.outline, cursor: 'pointer' },
  crumbSep: { fontFamily: fonts.label, fontSize: 11, color: colors.outlineVariant, marginHorizontal: 4 },
  crumbActive: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, color: colors.onSurfaceVariant },
  mainWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },
  editorCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  titleBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  heroSection: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  heroToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.xs, marginBottom: spacing.xs },
  heroCollapsedSummary: { marginRight: spacing.xs },
  heroCardWrap: { maxWidth: 480 },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.player + '44', alignSelf: 'flex-start' },
  disabledEditor: { opacity: 0.55 },
  saveIndicator: { position: 'absolute', bottom: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surfaceContainerHigh + 'dd', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  saveDot: { width: 6, height: 6, borderRadius: 3 },
  saveText: { fontFamily: fonts.label, fontSize: 11, color: colors.outline },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  deleteBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerContainer + '44', borderBottomWidth: 1, borderBottomColor: colors.hpDanger + '33' },
  deleteBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.lg },
  deleteBannerConfirm: { borderWidth: 1, borderColor: colors.hpDanger + '55' },
});
