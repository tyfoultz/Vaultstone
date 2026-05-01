import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  forceReleasePageEdit,
  getPagesLinkingTo,
  getEventsReferencingPage,
  releasePageEdit,
  trashPage,
  updatePage,
} from '@vaultstone/api';
import type { TimelineEvent } from '@vaultstone/types';
import {
  selectSectionsForWorld,
  useAuthStore,
  useCurrentWorldStore,
  usePagesStore,
  useSectionsStore,
} from '@vaultstone/store';
import type { Json, WorldPage } from '@vaultstone/types';
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
type Props = { page: WorldPage; worldId: string };
type RightTab = 'on_this_page' | 'sub_pages';

const STATUS_COLOR: Record<string, string> = {
  active: colors.hpHealthy,
  completed: colors.gm,
  failed: colors.hpDanger,
  'on-hold': colors.outline,
};

const PRIORITY_COLOR: Record<string, string> = {
  main: colors.primary,
  side: colors.cosmic,
  personal: colors.player,
};

// ── Inline page_ref picker (quest giver) ──

function InlinePagePicker({ label, icon, value, candidates, onSelect, accentColor, worldId }: {
  label: string;
  icon: string;
  value: WorldPage | null;
  candidates: WorldPage[];
  onSelect: (id: string | null) => void;
  accentColor: string;
  worldId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const router = useRouter();

  const filtered = search
    ? candidates.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()))
    : candidates;

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span
        onClick={() => setOpen(!open)}
        style={{
          cursor: 'pointer',
          fontFamily: "'Manrope', system-ui, sans-serif",
          fontSize: 13,
          color: value ? colors.onSurfaceVariant : colors.outline,
        }}
      >
        {label}{' '}
        <span
          style={{
            color: value ? accentColor : colors.outline,
            fontWeight: value ? 600 : 400,
            textDecoration: value ? 'underline' : 'none',
            textDecorationColor: accentColor + '44',
            textUnderlineOffset: '2px',
          }}
          onClick={(e) => {
            if (value) { e.stopPropagation(); router.push(worldPageHref(worldId, value.id)); }
          }}
        >
          {value?.title ?? '—'}
        </span>
      </span>

      {open ? createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9000 }} onClick={() => { setOpen(false); setSearch(''); }} />
          <div style={{
            position: 'fixed',
            top: '30%',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9001,
            background: colors.surfaceContainerHigh,
            border: `1px solid ${colors.outlineVariant}55`,
            borderRadius: 10,
            padding: 12,
            width: 300,
            maxHeight: 340,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontFamily: "'Manrope'", fontSize: 11, color: colors.outline, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e: any) => setSearch(e.target.value)}
              autoFocus
              placeholder={`Search ${label.toLowerCase().replace(/:.*/,'')}…`}
              style={{
                width: '100%',
                background: colors.surfaceContainerLowest,
                border: `1px solid ${colors.outlineVariant}44`,
                borderRadius: 6,
                padding: '6px 10px',
                color: colors.onSurface,
                fontSize: 13,
                fontFamily: "'Manrope', system-ui, sans-serif",
                outline: 'none',
                marginBottom: 6,
              }}
            />
            {value ? (
              <div
                onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', cursor: 'pointer', borderRadius: 6, marginBottom: 4 }}
              >
                <span style={{ fontFamily: "'Manrope'", fontSize: 12, color: colors.outline, fontStyle: 'italic' }}>Clear</span>
              </div>
            ) : null}
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 8, fontFamily: "'Manrope'", fontSize: 12, color: colors.outline, fontStyle: 'italic' }}>
                  {search ? 'No matches.' : 'No pages available.'}
                </div>
              ) : filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); setSearch(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 8px', borderRadius: 6, cursor: 'pointer',
                    background: value?.id === p.id ? colors.primaryContainer + '22' : 'transparent',
                  }}
                  onMouseEnter={(e: any) => { if (value?.id !== p.id) e.currentTarget.style.background = colors.surfaceContainer; }}
                  onMouseLeave={(e: any) => { if (value?.id !== p.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontFamily: "'Manrope'", fontSize: 13, color: colors.onSurface, flex: 1 }}>{p.title}</span>
                </div>
              ))}
            </div>
          </div>
        </>,
        document.body,
      ) : null}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ── Main Component ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

type CanvasBlock = { id: string; x: number; y: number; width: number; height?: number; html: string };

export function QuestPageView({ page, worldId }: Props) {
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
  const [editingTitle, setEditingTitle] = useState(false);

  const section = useMemo(() => sections.find((s) => s.id === page.section_id) ?? null, [sections, page]);
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

  // Fields
  const status = typeof fields.status === 'string' ? fields.status : '';
  const priority = typeof fields.priority === 'string' ? fields.priority : '';
  const reward = typeof fields.reward === 'string' ? fields.reward : '';
  const hooks = Array.isArray(fields.__hooks) ? (fields.__hooks as string[]) : [];
  const locationTags: string[] = Array.isArray(fields.locations) ? (fields.locations as string[]) : [];
  const relatedNpcTags: string[] = Array.isArray(fields.related_npcs) ? (fields.related_npcs as string[]) : [];

  // Quest giver (page_ref)
  const questGiverId = typeof fields.quest_giver === 'string' ? fields.quest_giver : null;
  const questGiverPage = questGiverId ? (allPages ?? []).find((p) => p.id === questGiverId) ?? null : null;
  const questGiverCandidates = useMemo(() => (allPages ?? []).filter((p) => p.page_kind === 'npc'), [allPages]);

  // Lock
  const [lockError, setLockError] = useState<{ ownerId: string; since: string } | null>(null);
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
      if (ctx.lockOwnerId && ctx.lockOwnerId !== ctx.myUserId && ctx.lockSince) setLockError({ ownerId: ctx.lockOwnerId, since: ctx.lockSince });
      else setLockError({ ownerId: ctx.lockOwnerId ?? 'unknown', since: ctx.lockSince ?? new Date().toISOString() });
      return;
    }
    if (data) { ctx.updatePageInStore(data.id, { editing_user_id: data.editing_user_id, editing_since: data.editing_since }); setLockError(null); }
  }, [page.id]);

  useEffect(() => {
    void tryClaim();
    const t = setInterval(() => void tryClaim(), LOCK_HEARTBEAT_MS);
    return () => { clearInterval(t); if (bodyTimerRef.current) clearTimeout(bodyTimerRef.current); void releasePageEdit(page.id); };
  }, [page.id, tryClaim]);

  const mentionablePages = useMemo(() => (allPages ?? []).filter((p) => p.id !== page.id), [allPages, page.id]);
  const sectionLabelById = useCallback((id: string) => sections.find((s) => s.id === id)?.name ?? '', [sections]);

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
      const { data, error } = await updatePage(page.id, { body: pending.body as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs });
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
  const subpages = useMemo(() => (allPages ?? []).filter((p) => p.parent_page_id === page.id).slice().sort((a, b) => a.sort_order - b.sort_order), [allPages, page.id]);
  const [backlinks, setBacklinks] = useState<WorldPage[]>([]);
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);
  useEffect(() => { let c = false; setBacklinksLoaded(false); void (async () => { const { data } = await getPagesLinkingTo(worldId, page.id); if (!c) { setBacklinks(data ?? []); setBacklinksLoaded(true); } })(); return () => { c = true; }; }, [page.id, worldId]);

  const [seenInPlay, setSeenInPlay] = useState<TimelineEvent[]>([]);
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => { let c = false; setSeenLoaded(false); void (async () => { const { data } = await getEventsReferencingPage(worldId, page.id); if (!c) { setSeenInPlay((data ?? []) as TimelineEvent[]); setSeenLoaded(true); } })(); return () => { c = true; }; }, [page.id, worldId]);

  const mentionedPages = useMemo(() => {
    const refs = page.body_refs ?? [];
    if (refs.length === 0) return [];
    return refs.map((id) => (allPages ?? []).find((p) => p.id === id)).filter((p): p is WorldPage => !!p);
  }, [page.body_refs, allPages]);

  // Property pills
  const STATUS_OPTIONS = ['active', 'completed', 'failed', 'on-hold'];
  const PRIORITY_OPTIONS = ['main', 'side', 'personal'];

  const propertyPills: PillDef[] = [
    { key: 'status', label: 'STATUS', value: status, icon: 'flag', fieldType: 'select', options: STATUS_OPTIONS, color: status ? STATUS_COLOR[status] : undefined },
    { key: 'priority', label: 'PRIORITY', value: priority, icon: 'priority-high', fieldType: 'select', options: PRIORITY_OPTIONS, color: priority ? PRIORITY_COLOR[priority] : undefined },
    { key: 'reward', label: 'REWARD', value: reward, icon: 'card-giftcard', fieldType: 'text' },
  ];

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved · just now' : saveState === 'error' ? 'Save failed' : '';

  // Tag management helpers
  function addTag(field: string, current: string[], tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || current.includes(trimmed)) return;
    updateField(field, [...current, trimmed]);
  }
  function removeTag(field: string, current: string[], index: number) {
    updateField(field, current.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.root}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={{ marginRight: 6 }}><Icon name="menu-book" size={18} color={colors.gm} /></View>
          <Pressable onPress={() => router.push(worldSectionHref(worldId, page.section_id))}>
            <Text style={styles.crumb}>{section?.name?.toUpperCase() ?? 'QUESTS'}</Text>
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

      {/* ── Title row ── */}
      <View style={styles.questHead}>
        <View style={{ marginRight: 4 }}><Icon name="menu-book" size={28} color={colors.gm} /></View>
        <View style={{ flex: 1, gap: 2 }}>
          {editingTitle ? (
            <input
              type="text"
              defaultValue={page.title}
              autoFocus
              onKeyDown={(e: any) => {
                if (e.key === 'Enter') {
                  const v = e.target.value.trim();
                  if (v && v !== page.title) { updatePageInStore(page.id, { title: v }); updatePage(page.id, { title: v }); }
                  setEditingTitle(false);
                }
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              onBlur={(e: any) => {
                const v = e.target.value.trim();
                if (v && v !== page.title) { updatePageInStore(page.id, { title: v }); updatePage(page.id, { title: v }); }
                setEditingTitle(false);
              }}
              style={{
                background: 'transparent',
                border: `1px solid ${colors.outlineVariant}44`,
                borderRadius: 6,
                padding: '2px 6px',
                color: colors.onSurface,
                fontSize: 28,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                fontWeight: 700,
                letterSpacing: -0.4,
                outline: 'none',
                width: '100%',
              }}
            />
          ) : (
            <Pressable onPress={() => setEditingTitle(true)}>
              <Text variant="headline-md" family="serif-display" weight="bold" style={styles.title}>{page.title}</Text>
            </Pressable>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 2 }}>
            <InlinePagePicker label="Quest Giver:" icon="person" value={questGiverPage} candidates={questGiverCandidates} onSelect={(id) => updateField('quest_giver', id)} accentColor={colors.cosmic} worldId={worldId} />
            {reward ? <span style={{ fontFamily: "'Manrope'", fontSize: 13, color: colors.onSurfaceVariant }}>Reward: <span style={{ color: colors.gm, fontWeight: 600 }}>{reward}</span></span> : null}
          </div>
          <View style={styles.statRow}>
            {status ? (
              <View style={[styles.statChip, { borderColor: (STATUS_COLOR[status] ?? colors.outline) + '44' }]}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] ?? colors.outline }]} />
                <Text style={[styles.statChipLabel, { color: STATUS_COLOR[status] ?? colors.outline }]}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </View>
            ) : null}
            {priority ? (
              <View style={[styles.statChip, { borderColor: (PRIORITY_COLOR[priority] ?? colors.outline) + '44' }]}>
                <Text style={[styles.statChipLabel, { color: PRIORITY_COLOR[priority] ?? colors.outline }]}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
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
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingLeft: spacing.lg, paddingRight: spacing.lg, paddingBottom: spacing.xs }}>
        {propertyPills.map((pill) => (
          <div key={pill.key} style={{ position: 'relative' }}>
            <Pressable onPress={() => setEditingPill(editingPill === pill.key ? null : pill.key)} style={[styles.pill, pill.color ? { borderColor: pill.color + '44' } : undefined, !pill.value && styles.pillEmpty]}>
              {pill.icon ? <Icon name={pill.icon as React.ComponentProps<typeof Icon>['name']} size={12} color={pill.color ?? colors.outline} /> : null}
              <Text style={[styles.pillLabel, pill.color ? { color: pill.color } : undefined]}>{pill.label}</Text>
              {pill.value ? <Text style={[styles.pillValue, pill.color ? { color: pill.color } : undefined]}>{pill.value.charAt(0).toUpperCase() + pill.value.slice(1)}</Text> : null}
            </Pressable>
            {editingPill === pill.key ? <PillEditor pill={pill} onSelect={(v) => { updateField(pill.key, v); setEditingPill(null); }} onClose={() => setEditingPill(null)} /> : null}
          </div>
        ))}
      </div>

      {confirmDelete ? (
        <View style={styles.deleteBanner}>
          <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>Delete this page? Recoverable for 30 days.</Text>
          <Pressable onPress={() => setConfirmDelete(false)} style={styles.deleteBannerBtn}><Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>Cancel</Text></Pressable>
          <Pressable onPress={handleDeletePage} style={[styles.deleteBannerBtn, { borderWidth: 1, borderColor: colors.hpDanger + '55' }]}>
            <Icon name="delete" size={14} color={colors.hpDanger} /><Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>Confirm</Text>
          </Pressable>
        </View>
      ) : null}

      {/* ── Main area ── */}
      <View style={styles.mainWrap}>
        <View style={styles.editorCol}>
          {bannerLock ? <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}><EditLockBanner ownerUserId={bannerLock.ownerId} lockedSinceIso={bannerLock.since} onRetry={tryClaim} onForceUnlock={isWorldOwner ? async () => { await forceReleasePageEdit(page.id); updatePageInStore(page.id, { editing_user_id: null, editing_since: null }); void tryClaim(); } : undefined} /></View> : null}
          <View style={[{ flex: 1 }, heldByOther ? styles.disabledEditor : undefined]} pointerEvents={heldByOther ? 'none' : 'auto'}>
            <LoreCanvasEditor initialBlocks={(page.body as Record<string, unknown>)?.__canvas_blocks as CanvasBlock[] | null ?? null} onChange={handleCanvasChange} editable={!heldByOther} mentionablePages={mentionablePages} getSectionLabel={sectionLabelById} onMentionClick={(targetId) => router.push(worldPageHref(worldId, targetId))} />
          </View>
          {saveLabel ? <View style={styles.saveIndicator}><View style={[styles.saveDot, saveState === 'error' ? { backgroundColor: colors.hpDanger } : { backgroundColor: colors.hpHealthy }]} /><Text style={styles.saveText}>{saveLabel}</Text></View> : null}
        </View>

        {/* ── Right sidebar ── */}
        {!rightPanelOpen ? (
          <View style={sideStyles.rightPanelCollapsed}>
            <Pressable onPress={() => setRightPanelOpen(true)} style={sideStyles.rightPanelToggleBtn}><Icon name="chevron-left" size={14} color={colors.onSurfaceVariant} /></Pressable>
          </View>
        ) : (
          <View style={sideStyles.rightPanel}>
            <View style={sideStyles.rightPanelTopRow}>
              <Pressable onPress={() => setRightPanelOpen(false)} style={sideStyles.rightPanelToggleBtn}><Icon name="chevron-right" size={14} color={colors.outline} /></Pressable>
            </View>
            <View style={sideStyles.rightTabs}>
              <RightTabBtn label="On This Page" active={rightTab === 'on_this_page'} onPress={() => setRightTab('on_this_page')} />
              <RightTabBtn label="Sub-pages" active={rightTab === 'sub_pages'} onPress={() => setRightTab('sub_pages')} />
            </View>

            <ScrollView contentContainerStyle={sideStyles.rightBody}>
              {rightTab === 'on_this_page' ? (
                <>
                  {/* Locations tags */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="place" title="LOCATIONS" count={locationTags.length || undefined} />
                    {locationTags.length > 0 ? (
                      <View style={styles.tagList}>
                        {locationTags.map((tag, i) => (
                          <View key={`loc-${i}`} style={styles.tag}>
                            <Text style={styles.tagText}>{tag}</Text>
                            <Pressable onPress={() => removeTag('locations', locationTags, i)} style={{ padding: 2 }}>
                              <Icon name="close" size={10} color={colors.outline} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No locations tagged yet.</Text>
                    )}
                    <TagInput onAdd={(tag) => addTag('locations', locationTags, tag)} placeholder="Add location tag…" />
                  </View>

                  {/* Related NPCs tags */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="person" title="RELATED NPCS" count={relatedNpcTags.length || undefined} />
                    {relatedNpcTags.length > 0 ? (
                      <View style={styles.tagList}>
                        {relatedNpcTags.map((tag, i) => (
                          <View key={`npc-${i}`} style={styles.tag}>
                            <Text style={styles.tagText}>{tag}</Text>
                            <Pressable onPress={() => removeTag('related_npcs', relatedNpcTags, i)} style={{ padding: 2 }}>
                              <Icon name="close" size={10} color={colors.outline} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text variant="body-sm" style={sideStyles.emptyText}>No related NPCs tagged yet.</Text>
                    )}
                    <TagInput onAdd={(tag) => addTag('related_npcs', relatedNpcTags, tag)} placeholder="Add NPC tag…" />
                  </View>

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
                    ) : seenInPlay.slice(0, 5).map((evt) => {
                      const ago = formatRelativeTime(evt.created_at);
                      const snippet = (evt.body_text ?? '').slice(0, 80);
                      return (
                        <View key={evt.id} style={sideStyles.seenRow}>
                          <View style={sideStyles.seenHeader}><View style={sideStyles.seenBadge}><Text style={sideStyles.seenBadgeText}>{evt.source_session_id ? 'S' : 'E'}</Text></View><Text style={sideStyles.seenAgo}>{ago}</Text></View>
                          <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 12 }}>{evt.title}</Text>
                          {snippet ? <Text variant="body-sm" numberOfLines={2} style={{ color: colors.onSurfaceVariant, fontSize: 11, marginTop: 2 }}>"{snippet}{(evt.body_text ?? '').length > 80 ? '…' : ''}"</Text> : null}
                        </View>
                      );
                    })}
                  </View>

                  {/* Hooks & Rumors */}
                  <View style={sideStyles.sideSection}>
                    <SideSectionHeader icon="lightbulb" title="HOOKS & RUMORS" count={hooks.length || undefined} />
                    {hooks.map((hook, i) => (
                      <View key={i} style={sideStyles.hookRow}>
                        <Text style={sideStyles.hookBullet}>•</Text>
                        <Text variant="body-sm" style={{ flex: 1, color: colors.onSurfaceVariant, fontSize: 12 }}>{hook}</Text>
                        <Pressable onPress={() => updateField('__hooks', hooks.filter((_, j) => j !== i))} style={{ padding: 2 }}><Icon name="close" size={12} color={colors.outline} /></Pressable>
                      </View>
                    ))}
                    <HookInput onAdd={(text) => updateField('__hooks', [...hooks, text])} />
                  </View>
                </>
              ) : null}

              {rightTab === 'sub_pages' ? (
                subpages.length === 0 ? (
                  <Text variant="body-sm" style={sideStyles.emptyText}>No sub-pages yet.</Text>
                ) : subpages.map((p) => (
                  <Pressable key={p.id} onPress={() => router.push(worldPageHref(worldId, p.id))} style={sideStyles.mentionRow}>
                    <Icon name="menu-book" size={14} color={colors.gm} />
                    <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>{p.title}</Text>
                    <Icon name="chevron-right" size={12} color={colors.outline} />
                  </Pressable>
                ))
              ) : null}
            </ScrollView>
          </View>
        )}
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
    </View>
  );
}

// ── Tag input (lightweight inline widget for tags fields) ──

function TagInput({ onAdd, placeholder }: { onAdd: (tag: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={styles.tagAddBtn}>
        <Icon name="add" size={14} color={colors.outline} />
        <Text style={{ color: colors.outline, fontSize: 11, fontFamily: 'Manrope' }}>{placeholder ?? 'Add tag'}</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ marginTop: 2 }}>
      <input
        type="text"
        value={draft}
        onChange={(e: any) => setDraft(e.target.value)}
        onKeyDown={(e: any) => {
          if (e.key === 'Enter' && draft.trim()) { onAdd(draft.trim()); setDraft(''); }
          if (e.key === 'Escape') { setOpen(false); setDraft(''); }
        }}
        autoFocus
        placeholder={placeholder ?? 'Type and press Enter…'}
        style={{
          background: colors.surfaceContainerHigh,
          border: `1px solid ${colors.outlineVariant}44`,
          borderRadius: 6,
          padding: '6px 8px',
          color: colors.onSurface,
          fontSize: 12,
          fontFamily: "'Manrope', system-ui, sans-serif",
          outline: 'none',
          width: '100%',
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '22' },
  topBarLeft: { flexDirection: 'row', alignItems: 'center' },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  crumb: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.outline },
  crumbSep: { fontFamily: fonts.label, fontSize: 11, color: colors.outlineVariant, marginHorizontal: 6 },
  crumbActive: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1, color: colors.onSurfaceVariant, fontWeight: '600' },

  questHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  title: { color: colors.onSurface, fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '44' },
  statChipLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.5, fontWeight: '600', color: colors.onSurfaceVariant },
  statusDot: { width: 7, height: 7, borderRadius: 4 },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '44' },
  pillEmpty: { borderStyle: 'dashed', opacity: 0.6 },
  pillLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 0.8, color: colors.outline },
  pillValue: { fontFamily: fonts.body, fontSize: 12, fontWeight: '600', color: colors.onSurface, textTransform: 'capitalize' },

  mainWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },
  editorCol: { flex: 1, backgroundColor: colors.surfaceCanvas, position: 'relative' },
  disabledEditor: { opacity: 0.55 },
  saveIndicator: { position: 'absolute', top: 8, right: 16, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 11 },
  saveDot: { width: 6, height: 6, borderRadius: 3 },
  saveText: { fontFamily: fonts.label, fontSize: 11, color: colors.outline },

  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  deleteBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerContainer + '44', borderBottomWidth: 1, borderBottomColor: colors.hpDanger + '33' },
  deleteBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.lg },

  // Tags
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '44', backgroundColor: colors.surfaceContainerHigh + '88' },
  tagText: { fontFamily: fonts.label, fontSize: 11, color: colors.onSurfaceVariant },
  tagAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineVariant + '33', borderStyle: 'dashed' },
});
