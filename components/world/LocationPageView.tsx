import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  cascadeMentionLabel,
  claimPageEdit,
  forceReleasePageEdit,
  getMap,
  getMapImageSignedUrl,
  getMyPagePermission,
  getPagesLinkingTo,
  getPinsForPage,
  getEventsReferencingPage,
  releasePageEdit,
  trashPage,
  updatePage,
  type BacklinkRow,
  type EventSummaryRow,
  type MapPin,
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
import type { Json, TemplateKey, WorldPage } from '@vaultstone/types';
import {
  Icon,
  Text,
  VisibilityBadge,
  colors,
  fonts,
  radius,
  spacing,
  useBreakpoint,
} from '@vaultstone/ui';

import { EditLockBanner } from './EditLockBanner';
import { LoreCanvasEditor } from './LoreCanvasEditor';
import { PlayerViewToggle } from './PlayerViewToggle';
import { ShareModal } from './ShareModal';
import { PAGE_KIND_LABEL, toMaterialIcon } from './helpers';
import { usePageVisibilityToggle } from './usePageVisibilityToggle';
import { worldMapHref, worldMapIndexHref, worldPageHref, worldSectionHref } from './worldHref';
import {
  type PillDef,
  PillEditor,
  CollapsibleSideSection,
  SideSectionHeader,
  RightTabBtn,
  HookInput,
  formatRelativeTime,
  MENTION_ICON,
  PAGE_SIDEBAR_STYLES as sideStyles,
} from './PageSidebarShared';

const LOCK_HEARTBEAT_MS = 60_000;
const MAP_PREVIEW_H = 120;
const MAP_ZOOM = 3;

function MapPinPreview({ signedUrl, label, xPct, yPct, mapWidth, mapHeight }: {
  signedUrl: string;
  label: string;
  xPct: number;
  yPct: number;
  mapWidth: number;
  mapHeight: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(260);

  useEffect(() => {
    if (containerRef.current) setContainerW(containerRef.current.offsetWidth);
  }, []);

  const scaledW = containerW * MAP_ZOOM;
  const scaledH = scaledW * (mapHeight / mapWidth);
  const offsetX = -(xPct * scaledW) + containerW / 2;
  const offsetY = -(yPct * scaledH) + MAP_PREVIEW_H / 2;

  return (
    <div
      ref={containerRef}
      style={{
        height: MAP_PREVIEW_H,
        overflow: 'hidden',
        position: 'relative',
        borderRadius: 4,
      }}
    >
      <img
        src={signedUrl}
        alt={label}
        style={{
          position: 'absolute',
          width: scaledW,
          height: scaledH,
          left: offsetX,
          top: offsetY,
        }}
      />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: colors.primary,
        border: `2px solid ${colors.surfaceCanvas}`,
        marginLeft: -6,
        marginTop: -6,
        boxShadow: `0 0 0 3px ${colors.primary}44`,
        zIndex: 2,
      }} />
    </div>
  );
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  worldId: string;
  splitMode?: boolean;
};

const DANGER_COLOR: Record<string, string> = {
  safe: colors.hpHealthy,
  low: colors.player,
  moderate: colors.hpWarning,
  high: colors.hpDanger,
  deadly: colors.hpDanger,
};


type RightTab = 'on_this_page' | 'sub_locations';

export function LocationPageView({ page, worldId, splitMode }: Props) {
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [editingTitle, setEditingTitle] = useState(false);
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
  const { isMobile, isTablet } = useBreakpoint();
  const [rightPanelOpen, setRightPanelOpen] = useState(!splitMode && !isTablet);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const section = useMemo(
    () => sections.find((s) => s.id === page.section_id) ?? null,
    [sections, page],
  );
  const fields = (page.structured_fields as Record<string, unknown>) ?? {};
  const fieldsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingPill, setEditingPill] = useState<string | null>(null);

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

  const locationType = typeof fields.type === 'string' ? fields.type : '';
  const region = typeof fields.region === 'string' ? fields.region : '';
  const population = typeof fields.population === 'string' ? fields.population : '';
  const governance = typeof fields.governance === 'string' ? fields.governance : '';
  const dangerLevel = typeof fields.danger_level === 'string' ? fields.danger_level : '';
  const terrain = typeof fields.terrain === 'string' ? fields.terrain : '';
  const tags = Array.isArray(fields.tags) ? (fields.tags as string[]) : [];
  const hooks = Array.isArray(fields.__hooks) ? (fields.__hooks as string[]) : [];

  const parentLocationId = typeof fields.parent_location === 'string' ? fields.parent_location : null;
  const parentPage = parentLocationId
    ? (allPages ?? []).find((p) => p.id === parentLocationId) ?? null
    : null;

  // NPCs associated with this location — mentioned on this page or children
  const locationNpcs = useMemo(() => {
    const pages = allPages ?? [];
    const npcPages = pages.filter((p) => p.page_kind === 'npc');
    const refs = page.body_refs ?? [];
    const referencedNpcs = npcPages.filter((p) => refs.includes(p.id));
    const backlinkNpcs = npcPages.filter(
      (p) => (p.body_refs ?? []).includes(page.id) && !referencedNpcs.some((r) => r.id === p.id),
    );
    return [...referencedNpcs, ...backlinkNpcs];
  }, [allPages, page.id, page.body_refs]);

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
  const [canEdit, setCanEdit] = useState(isWorldOwner);
  useEffect(() => {
    if (isWorldOwner) { setCanEdit(true); return; }
    getMyPagePermission(page.id).then(({ data }) => setCanEdit(data === 'edit'));
  }, [page.id, isWorldOwner]);
  const readOnly = !canEdit || heldByOther;

  const lockCtxRef = useRef({ lockOwnerId, lockSince, myUserId, updatePageInStore });
  lockCtxRef.current = { lockOwnerId, lockSince, myUserId, updatePageInStore };

  const tryClaim = useCallback(async () => {
    if (!page.id || !canEdit) return;
    const { data, error } = await claimPageEdit(page.id);
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
        if (pending) { pendingBodyRef.current = null; void updatePage(page.id, { body: pending.body as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs }); }
      }
      void releasePageEdit(page.id);
    };
  }, [page.id, tryClaim]);

  type CanvasBlock = { id: string; x: number; y: number; width: number; height?: number; html: string };

  const mentionablePages = useMemo(
    () => (allPages ?? []).filter((p) => p.id !== page.id),
    [allPages, page.id],
  );

  const sectionLabelById = useCallback(
    (id: string) => sections.find((s) => s.id === id)?.name ?? '',
    [sections],
  );

  async function flushAndNavigate(targetId: string) {
    if (bodyTimerRef.current) { clearTimeout(bodyTimerRef.current); bodyTimerRef.current = null; }
    const pending = pendingBodyRef.current;
    if (pending) { pendingBodyRef.current = null; await updatePage(page.id, { body: pending.body as Json, body_text: pending.bodyText, body_refs: pending.bodyRefs }); }
    router.push(worldPageHref(worldId, targetId));
  }

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

  const [backlinks, setBacklinks] = useState<BacklinkRow[]>([]);
  const [backlinksLoaded, setBacklinksLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setBacklinksLoaded(false);
    void (async () => {
      const { data } = await getPagesLinkingTo(worldId, page.id);
      if (!cancelled) {
        setBacklinks((data ?? []) as BacklinkRow[]);
        setBacklinksLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [page.id, worldId]);

  // Map pin data
  const [mapPin, setMapPin] = useState<MapPin | null>(null);
  const [mapData, setMapData] = useState<{ map: WorldMap; signedUrl: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setMapPin(null);
    setMapData(null);
    void (async () => {
      const { data: pins } = await getPinsForPage(page.id);
      if (cancelled || !pins || pins.length === 0) return;
      const pin = pins[0];
      setMapPin(pin);
      const { data: map } = await getMap(pin.map_id);
      if (cancelled || !map) return;
      const { data: signed } = await getMapImageSignedUrl(map.image_key);
      if (cancelled || !signed) return;
      setMapData({ map, signedUrl: signed.signedUrl });
    })();
    return () => { cancelled = true; };
  }, [page.id]);

  // Seen in play — timeline events that reference this page
  const [seenInPlay, setSeenInPlay] = useState<EventSummaryRow[]>([]);
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSeenLoaded(false);
    void (async () => {
      const { data } = await getEventsReferencingPage(worldId, page.id);
      if (!cancelled) {
        setSeenInPlay((data ?? []) as EventSummaryRow[]);
        setSeenLoaded(true);
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

  const TYPE_OPTIONS = ['city', 'town', 'village', 'hamlet', 'district', 'dungeon', 'wilderness', 'ruin', 'temple', 'tavern', 'fortress', 'landmark'];
  const DANGER_OPTIONS = ['safe', 'low', 'moderate', 'high', 'deadly'];
  const TERRAIN_OPTIONS = ['coastal', 'forest', 'mountain', 'desert', 'arctic', 'swamp', 'plains', 'underground', 'urban', 'volcanic', 'island'];

  const propertyPills: PillDef[] = [
    { key: 'type', label: 'TYPE', value: locationType, icon: 'location-city', fieldType: 'select', options: TYPE_OPTIONS },
    { key: 'region', label: 'REGION', value: region, icon: 'public', fieldType: 'text' },
    { key: 'population', label: 'POP', value: population, icon: 'groups', fieldType: 'text' },
    { key: 'governance', label: 'RULER', value: governance, icon: 'person', fieldType: 'text' },
    { key: 'terrain', label: 'TERRAIN', value: terrain, icon: 'terrain', fieldType: 'select', options: TERRAIN_OPTIONS },
    { key: 'danger_level', label: 'DANGER', value: dangerLevel, icon: 'warning', fieldType: 'select', options: DANGER_OPTIONS, color: dangerLevel ? DANGER_COLOR[dangerLevel] : undefined },
  ];

  const saveLabel = saveState === 'saving' ? 'Saving…' :
    saveState === 'saved' ? 'Saved · just now' :
    saveState === 'error' ? 'Save failed' : '';

  const renderPills = () => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingBottom: spacing.xs }}>
      {propertyPills.map((pill) => (
        <div key={pill.key} style={{ position: 'relative', maxWidth: '100%' }}>
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
              <Text numberOfLines={1} style={[styles.pillValue, { flexShrink: 1 }, pill.color ? { color: pill.color } : undefined]}>
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
      {tags.map((tag) => (
        <View key={tag} style={styles.tagPill}>
          <Text style={styles.tagDot}>·</Text>
          <Text style={styles.tagText}>{tag}</Text>
        </View>
      ))}
    </View>
  );

  const renderSidebarBody = () => (
    <>
      <View style={sideStyles.rightTabs}>
        <RightTabBtn label="On This Page" active={rightTab === 'on_this_page'} onPress={() => setRightTab('on_this_page')} />
        <RightTabBtn label="Sub-locations" active={rightTab === 'sub_locations'} onPress={() => setRightTab('sub_locations')} />
      </View>

      <ScrollView contentContainerStyle={sideStyles.rightBody}>
        {rightTab === 'on_this_page' ? (
          <>
            <View style={sideStyles.sideSection}>
              <SideSectionHeader icon="place" title="MAP PIN" />
              {mapPin && mapData ? (
                <Pressable
                  onPress={() => router.push(worldMapHref(worldId, mapPin.map_id))}
                  style={styles.mapPreview}
                >
                  <MapPinPreview
                    signedUrl={mapData.signedUrl}
                    label={mapData.map.label}
                    xPct={mapPin.x_pct}
                    yPct={mapPin.y_pct}
                    mapWidth={mapData.map.image_width}
                    mapHeight={mapData.map.image_height}
                  />
                  <View style={styles.mapMeta}>
                    <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 12 }}>
                      {mapData.map.label}
                    </Text>
                    <Text style={styles.mapMetaLink}>OPEN MAP →</Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => router.push(worldMapIndexHref(worldId))}
                  style={styles.mapPlaceholder}
                >
                  <Icon name="map" size={24} color={colors.outline} />
                  <Text variant="body-sm" style={{ color: colors.outline, marginTop: 4 }}>No map pin set</Text>
                  <Text variant="body-sm" style={{ color: colors.primary, marginTop: 2, fontSize: 11 }}>Open Maps →</Text>
                </Pressable>
              )}
            </View>

            <CollapsibleSideSection icon="alternate-email" title="MENTIONED ON THIS PAGE" count={mentionedPages.length || undefined}>
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
            </CollapsibleSideSection>

            <CollapsibleSideSection icon="history" title="SEEN IN PLAY" count={seenLoaded && seenInPlay.length > 0 ? seenInPlay.length : undefined}>
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
            </CollapsibleSideSection>

            <CollapsibleSideSection icon="link" title="LINKED FROM" count={backlinksLoaded && backlinks.length > 0 ? backlinks.length : undefined}>
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
            </CollapsibleSideSection>

            {/* NPCs */}
            <CollapsibleSideSection icon="person" title="NPCS HERE" count={locationNpcs.length || undefined}>
              {locationNpcs.length === 0 ? (
                <Text variant="body-sm" style={sideStyles.emptyText}>No NPCs linked yet. Use @mention to reference NPC pages.</Text>
              ) : (
                locationNpcs.map((npc) => (
                  <Pressable key={npc.id} onPress={() => router.push(worldPageHref(worldId, npc.id))} style={sideStyles.mentionRow}>
                    <View style={[sideStyles.mentionDot, { backgroundColor: colors.hpDanger }]} />
                    <View style={{ flex: 1 }}>
                      <Text variant="label-md" weight="semibold" numberOfLines={1} style={{ color: colors.onSurface, fontSize: 13 }}>{npc.title}</Text>
                      <Text style={sideStyles.mentionMeta}>NPC</Text>
                    </View>
                    <Icon name="chevron-right" size={12} color={colors.outline} />
                  </Pressable>
                ))
              )}
            </CollapsibleSideSection>

            {/* Hooks & Rumors */}
            <CollapsibleSideSection icon="lightbulb" title="HOOKS & RUMORS" count={hooks.length || undefined}>
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
            </CollapsibleSideSection>
          </>
        ) : null}

        {rightTab === 'sub_locations' ? (
          subpages.length === 0 ? (
            <Text variant="body-sm" style={sideStyles.emptyText}>No sub-locations yet.</Text>
          ) : (
            subpages.map((p) => {
              let iconName = 'place';
              try {
                const tpl = getTemplate(p.template_key as TemplateKey, p.template_version);
                iconName = toMaterialIcon(tpl.icon);
              } catch { /* default */ }
              return (
                <Pressable key={p.id} onPress={() => router.push(worldPageHref(worldId, p.id))} style={sideStyles.mentionRow}>
                  <Icon name={iconName as React.ComponentProps<typeof Icon>['name']} size={14} color={colors.primary} />
                  <Text variant="body-sm" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>{p.title}</Text>
                  <Icon name="chevron-right" size={12} color={colors.outline} />
                </Pressable>
              );
            })
          )
        ) : null}

      </ScrollView>
    </>
  );

  return (
    <View style={splitMode ? styles.rootSplit : styles.root}>
      {/* ── Compact top bar: breadcrumbs + title + actions ── */}
      {!splitMode ? (
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
          {!isMobile ? <PlayerViewToggle /> : null}
          <VisibilityBadge
            visibility={page.visible_to_players ? 'player' : 'gm'}
            interactive={isWorldOwner}
            onPress={() => setShareOpen(true)}
          />
          {isWorldOwner ? (
            <Pressable onPress={() => setShareOpen(true)} style={styles.shareBtn}>
              <Icon name="share" size={14} color={colors.onSurfaceVariant} />
              {!isMobile ? <Text variant="label-md" uppercase weight="semibold" style={{ color: colors.onSurfaceVariant, letterSpacing: 1, fontSize: 11 }}>Share</Text> : null}
            </Pressable>
          ) : null}
        </View>
      </View>
      ) : null}

      {/* ── Title row + pills (fixed height for cross-template alignment) ── */}
      <View style={isMobile ? styles.headerWrapMobile : styles.headerWrap}>
      <View style={styles.titleBar}>
        <Icon name="place" size={20} color={colors.primary} />
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
              fontSize: 22,
              fontWeight: 700,
              outline: 'none',
              padding: '2px 6px',
              width: '100%',
            }}
          />
        ) : (
          <Pressable onPress={() => {}} onLongPress={() => setEditingTitle(true)}>
            <div onDoubleClick={() => setEditingTitle(true)}>
              <Text variant="headline-md" family="serif-display" weight="bold" style={styles.title}>
                {page.title}
              </Text>
            </div>
          </Pressable>
        )}
      </View>

      {/* ── Property pills (editable) — hidden on mobile ── */}
      {!isMobile ? renderPills() : null}
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
          {bannerLock && isWorldOwner ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
              <EditLockBanner ownerUserId={bannerLock.ownerId} lockedSinceIso={bannerLock.since} onRetry={tryClaim} onForceUnlock={isWorldOwner ? async () => { await forceReleasePageEdit(page.id); updatePageInStore(page.id, { editing_user_id: null, editing_since: null }); void tryClaim(); } : undefined} />
            </View>
          ) : null}

          <View
            style={[{ flex: 1 }, readOnly ? styles.disabledEditor : undefined]}
          >
            <LoreCanvasEditor
              initialBlocks={
                (page.body as Record<string, unknown>)?.__canvas_blocks as CanvasBlock[] | null ?? null
              }
              onChange={handleCanvasChange}
              editable={!readOnly}
              mentionablePages={mentionablePages}
              getSectionLabel={sectionLabelById}
              onMentionClick={(targetId) => void flushAndNavigate(targetId)}
              worldId={worldId}
              pageId={page.id}
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

        {/* ── Right sidebar — hidden on mobile ── */}
        {!isMobile ? (
          !rightPanelOpen ? (
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
              {renderSidebarBody()}
            </View>
          )
        ) : null}
      </View>

      {/* ── Mobile FAB + bottom-sheet overlay ── */}
      {isMobile ? (
        <>
          <Pressable
            style={{ position: 'absolute', bottom: 24, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryContainer, alignItems: 'center', justifyContent: 'center', elevation: 4 }}
            onPress={() => setSidebarOpen(true)}
          >
            <Icon name="info-outline" size={20} color={colors.primary} />
          </Pressable>
          <Modal visible={sidebarOpen} transparent animationType="slide" onRequestClose={() => setSidebarOpen(false)}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => setSidebarOpen(false)}>
              <Pressable style={{ backgroundColor: colors.surfaceContainerHigh, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '80%' }} onPress={() => {}}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant + '33' }}>
                  <Text variant="title-sm" weight="bold" style={{ color: colors.onSurface }}>Details</Text>
                  <Pressable onPress={() => setSidebarOpen(false)} hitSlop={8}>
                    <Icon name="close" size={20} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
                <ScrollView>
                  <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                    {renderPills()}
                  </View>
                  {renderSidebarBody()}
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : null}

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  rootSplit: { flex: 1, backgroundColor: colors.surfaceCanvas, minHeight: 0 },
  headerWrap: { height: 120, overflow: 'hidden' as const },
  headerWrapMobile: { paddingBottom: spacing.xs },

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

  mapPlaceholder: {
    height: 100,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPreview: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    overflow: 'hidden',
    backgroundColor: colors.surfaceContainerHigh,
  },
  mapImageWrap: {
    height: 120,
    overflow: 'hidden',
    position: 'relative',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapPinDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surfaceCanvas,
    marginLeft: -5,
    marginTop: -5,
  },
  mapMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
  },
  mapMetaLink: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.primary,
    fontWeight: '600',
  },
  pillEmpty: {
    borderStyle: 'dashed',
    opacity: 0.6,
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
