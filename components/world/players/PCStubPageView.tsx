import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
  getCharacterById,
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
import type { Database, Json, TemplateKey, WorldPage, Dnd5eStats, Dnd5eResources, Dnd5eEquipmentItem } from '@vaultstone/types';
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

import { BodyEditor } from '../BodyEditor';
import { EditLockBanner } from '../EditLockBanner';
import { OrphanBanner } from '../OrphanBanner';
import { PageHead } from '../PageHead';
import { PlayerViewToggle } from '../PlayerViewToggle';
import { ShareModal } from '../ShareModal';
import { StructuredFieldsForm } from '../StructuredFieldsForm';
import { WikiRightPanel } from '../WikiRightPanel';
import { WorldTopBar } from '../WorldTopBar';
import { PAGE_KIND_LABEL } from '../helpers';
import { usePageVisibilityToggle } from '../usePageVisibilityToggle';
import { worldHref, worldPageHref, worldSectionHref } from '../worldHref';
import { OrphanResolveModal } from './OrphanResolveModal';

type Character = Database['public']['Tables']['characters']['Row'];
type MentionPinItem = { id: string; mapId: string; label: string; mapLabel: string; icon: string };
type MentionEventItem = { id: string; eventId: string; label: string; timelineTitle: string; icon: string };

const LOCK_HEARTBEAT_MS = 30_000;
const EMPTY_MENTION_EVENTS: MentionEventItem[] = [];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  worldId: string;
};

export function PCStubPageView({ page, worldId }: Props) {
  const router = useRouter();
  const world = useCurrentWorldStore((s) => s.world);
  const sections = useSectionsStore((s) => selectSectionsForWorld(s, worldId));
  const allPages = usePagesStore((s) => worldId ? s.byWorldId[worldId] : undefined);
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

  // Title override tracking
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(page.title);

  async function handleTitleSave() {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === page.title) {
      setEditingTitle(false);
      return;
    }
    const { data } = await updatePage(page.id, { title: trimmed, title_overridden: true });
    if (data) {
      updatePageInStore(page.id, { title: data.title, title_overridden: data.title_overridden });
    }
    setEditingTitle(false);
  }

  async function handleTitleReset() {
    if (!character) return;
    const { data } = await updatePage(page.id, { title: character.name, title_overridden: false });
    if (data) {
      updatePageInStore(page.id, { title: data.title, title_overridden: data.title_overridden });
      setTitleDraft(data.title);
    }
  }

  // Lock
  const [lockError, setLockError] = useState<{ ownerId: string; since: string } | null>(null);
  const section = useMemo(() => sections.find((s) => s.id === page.section_id) ?? null, [sections, page]);

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
      if (bodyTimerRef.current) {
        clearTimeout(bodyTimerRef.current);
        bodyTimerRef.current = null;
      }
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

  const template = getTemplate(page.template_key as TemplateKey, page.template_version);
  const kindLabel = PAGE_KIND_LABEL[page.page_kind] ?? 'Player character';

  // Orphan detection
  const isOrphan = page.is_orphaned;

  // Ability score helpers
  const ABILITY_KEYS = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
  const ABILITY_ABBR: Record<string, string> = {
    strength: 'STR', dexterity: 'DEX', constitution: 'CON',
    intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
  };
  function mod(val: number): string {
    const m = Math.floor((val - 10) / 2);
    return (m >= 0 ? '+' : '') + m;
  }

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'world', label: world?.name ?? '' },
          { key: 'section', label: section?.name ?? 'Players' },
          { key: 'page', label: page.title },
        ]}
        saveState={saveState}
        actions={
          <>
            <PlayerViewToggle />
            {isWorldOwner ? (
              <>
                <Pressable onPress={() => setShareOpen(true)} style={styles.shareBtn} accessibilityLabel="Share page">
                  <Icon name="share" size={14} color={colors.onSurfaceVariant} />
                  <Text variant="label-md" uppercase weight="semibold" style={{ color: colors.onSurfaceVariant, letterSpacing: 1, fontSize: 11 }}>
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
            Delete this page and all sub-pages? Recoverable for 30 days.
          </Text>
          <Pressable onPress={() => setConfirmDelete(false)} style={styles.deleteBannerBtn}>
            <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleDeletePage} style={[styles.deleteBannerBtn, styles.deleteBannerConfirm]}>
            <Icon name="delete" size={14} color={colors.hpDanger} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>Confirm delete</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.wikiWrap}>
        <ScrollView style={styles.wikiDoc} contentContainerStyle={styles.wikiDocInner}>
          {/* Page head with editable title */}
          <View style={styles.headRow}>
            <PageHead
              icon={template.icon}
              title={editingTitle ? '' : page.title}
              accentToken={template.accentToken}
              metaPills={[
                { key: 'kind', icon: 'person', label: kindLabel },
                ...(isOrphan ? [{ key: 'orphan', icon: 'link-off' as const, label: 'Orphaned', tone: 'danger' as const }] : []),
              ]}
              actions={
                <VisibilityBadge
                  visibility={page.visible_to_players ? 'player' : 'gm'}
                  interactive={!!toggleVisibility}
                  onPress={toggleVisibility ?? undefined}
                />
              }
            />
          </View>

          {/* Title override controls */}
          {isWorldOwner && !heldByOther ? (
            <View style={styles.titleControls}>
              {editingTitle ? (
                <View style={styles.titleEditRow}>
                  <Input
                    value={titleDraft}
                    onChangeText={setTitleDraft}
                    onSubmitEditing={handleTitleSave}
                    autoFocus
                    style={{ flex: 1 }}
                  />
                  <GhostButton label="Save" onPress={handleTitleSave} />
                  <GhostButton label="Cancel" onPress={() => { setEditingTitle(false); setTitleDraft(page.title); }} />
                </View>
              ) : (
                <View style={styles.titleEditRow}>
                  <Pressable onPress={() => setEditingTitle(true)} style={styles.titleEditBtn}>
                    <Icon name="edit" size={12} color={colors.onSurfaceVariant} />
                    <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                      Rename
                    </Text>
                  </Pressable>
                  {page.title_overridden && character ? (
                    <Pressable onPress={handleTitleReset} style={styles.titleEditBtn}>
                      <Icon name="refresh" size={12} color={colors.outline} />
                      <Text variant="label-sm" style={{ color: colors.outline }}>
                        Reset to "{character.name}"
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>
          ) : null}

          <View style={{ marginTop: spacing.lg, gap: spacing.lg }}>
            {isOrphan ? (
              <View>
                <OrphanBanner page={page} />
                {isWorldOwner ? (
                  <Pressable onPress={() => setOrphanResolveOpen(true)} style={styles.resolveBtn}>
                    <Icon name="build" size={12} color={colors.player} />
                    <Text variant="label-sm" weight="semibold" style={{ color: colors.player }}>
                      Resolve orphan
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {bannerLock ? (
              <EditLockBanner ownerUserId={bannerLock.ownerId} lockedSinceIso={bannerLock.since} onRetry={tryClaim} />
            ) : null}

            {/* Character stat hero card */}
            {character && stats ? (
              <Card tier="container" padding="sm" style={styles.heroCard}>
                {/* Vitals */}
                <View style={styles.heroVitals}>
                  <VitalCell label="HIT POINTS" value={`${resources?.hpCurrent ?? 0}`} suffix={` / ${stats.hpMax}`} hp hpPct={Math.round(((resources?.hpCurrent ?? 0) / (stats.hpMax || 1)) * 100)} />
                  <VitalCell label="ARMOR CLASS" value={String(computeAC(stats, resources))} border />
                  <VitalCell label="SPEED" value={String(stats.speed ?? 30)} suffix=" ft" border />
                  <VitalCell label="LEVEL" value={String(stats.level ?? 1)} border />
                </View>

                {/* Ability scores */}
                <View style={styles.heroAbilRow}>
                  {ABILITY_KEYS.map((key) => {
                    const val = stats.abilityScores?.[key] ?? 10;
                    const isSave = stats.savingThrowProficiencies?.includes(key);
                    return (
                      <View key={key} style={styles.heroAbil}>
                        {isSave ? <View style={styles.heroSaveDot} /> : null}
                        <Text style={styles.heroAbilLabel}>{ABILITY_ABBR[key]}</Text>
                        <Text style={styles.heroAbilValue}>{val}</Text>
                        <Text style={styles.heroAbilMod}>({mod(val)})</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Conditions */}
                {conditions.length > 0 ? (
                  <View style={styles.heroConditions}>
                    <Text style={styles.heroCondLabel}>CONDITIONS</Text>
                    <View style={styles.heroCondChips}>
                      {conditions.map((c) => (
                        <View key={c} style={styles.heroCondChip}>
                          <Text style={styles.heroCondChipText}>{c}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Species / class / background */}
                <View style={styles.heroMeta}>
                  <MetaLabel size="sm" tone="muted">
                    {[
                      stats.speciesKey?.replace(/-/g, ' '),
                      stats.classKey?.replace(/-/g, ' '),
                      stats.backgroundKey?.replace(/-/g, ' '),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </MetaLabel>
                </View>
              </Card>
            ) : !page.character_id ? (
              <Card tier="container" padding="lg" style={styles.noCharCard}>
                <Icon name="person-off" size={24} color={colors.outlineVariant} />
                <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.xs }}>
                  No linked character — this is a standalone player page.
                </Text>
              </Card>
            ) : null}

            {/* Structured fields + body editor */}
            <View
              style={heldByOther ? styles.disabledEditor : undefined}
              pointerEvents={heldByOther ? 'none' : 'auto'}
            >
              <StructuredFieldsForm page={page} template={template} onSaveStateChange={setSaveState} />

              <View style={[styles.bodySection, { marginTop: spacing.lg }]}>
                <MetaLabel size="sm" tone="muted" style={{ marginBottom: spacing.xs }}>
                  DM Notes
                </MetaLabel>
                <BodyEditor
                  initialContent={(page.body as object) ?? null}
                  onChange={handleBodyChange}
                  editable={!heldByOther}
                  placeholder={`Notes about ${page.title}…`}
                  mentionablePages={mentionablePages}
                  onMentionClick={(targetPageId) => router.push(worldPageHref(worldId, targetPageId))}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <WikiRightPanel pageId={page.id} worldId={worldId} />
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
      {orphanResolveOpen ? (
        <OrphanResolveModal page={page} worldId={worldId} onClose={() => setOrphanResolveOpen(false)} />
      ) : null}
    </View>
  );
}

function VitalCell({ label, value, suffix, hp, hpPct, border }: {
  label: string;
  value: string;
  suffix?: string;
  hp?: boolean;
  hpPct?: number;
  border?: boolean;
}) {
  const hpColor = hp && hpPct != null
    ? hpPct < 30 ? colors.hpDanger : hpPct < 60 ? colors.hpWarning : colors.player
    : colors.player;

  return (
    <View style={[vitalStyles.cell, border && vitalStyles.cellBorder]}>
      <Text style={vitalStyles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={vitalStyles.value}>{value}</Text>
        {suffix ? <Text style={vitalStyles.suffix}>{suffix}</Text> : null}
      </View>
      {hp ? (
        <View style={vitalStyles.barTrack}>
          <View style={[vitalStyles.barFill, { width: `${Math.min(hpPct ?? 0, 100)}%`, backgroundColor: hpColor }]} />
        </View>
      ) : null}
    </View>
  );
}

function computeAC(stats: Dnd5eStats | null, resources: Dnd5eResources | null): number {
  if (!stats) return 10;
  const dexMod = Math.floor(((stats.abilityScores?.dexterity ?? 10) - 10) / 2);
  const equipment: Dnd5eEquipmentItem[] = resources?.equipment ?? [];
  const armor = equipment.find((e: Dnd5eEquipmentItem) => e.slot === 'armor' && e.equipped);
  const shield = equipment.find((e: Dnd5eEquipmentItem) => e.slot === 'shield' && e.equipped);
  let ac = 10 + dexMod;
  if (armor) {
    ac = armor.acBase ?? 10;
    if (armor.dexCap === null || armor.dexCap === undefined) {
      ac += dexMod;
    } else {
      ac += Math.min(dexMod, armor.dexCap);
    }
  }
  if (shield) ac += shield.acBonus ?? 2;
  return ac;
}

const vitalStyles = StyleSheet.create({
  cell: { flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  cellBorder: { borderLeftWidth: 1, borderLeftColor: colors.outlineVariant },
  label: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.2, color: colors.outline },
  value: { fontFamily: fonts.headline, fontSize: 22, fontWeight: '500', color: colors.onSurface, marginTop: 2 },
  suffix: { fontFamily: fonts.headline, fontSize: 14, color: colors.outline },
  barTrack: { height: 4, backgroundColor: colors.surfaceContainerHighest, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  wikiWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },
  wikiDoc: { flex: 1, backgroundColor: colors.surfaceCanvas },
  wikiDocInner: { maxWidth: 780, paddingTop: 28, paddingHorizontal: 48, paddingBottom: 64 },
  headRow: {},
  titleControls: { marginTop: spacing.sm },
  titleEditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  resolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.player + '44', alignSelf: 'flex-start' },
  heroCard: { borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.xl, overflow: 'hidden', padding: 0 },
  heroVitals: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  heroAbilRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  heroAbil: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRightWidth: 1, borderRightColor: colors.outlineVariant },
  heroSaveDot: { position: 'absolute', top: 6, right: 6, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary },
  heroAbilLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.4, color: colors.outline },
  heroAbilValue: { fontFamily: fonts.headline, fontSize: 20, fontWeight: '500', color: colors.onSurface, marginTop: 2 },
  heroAbilMod: { fontFamily: fonts.label, fontSize: 11, color: colors.onSurfaceVariant, marginTop: 1 },
  heroConditions: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.outlineVariant },
  heroCondLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.2, color: colors.outline },
  heroCondChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroCondChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hpWarning },
  heroCondChipText: { fontFamily: fonts.label, fontSize: 11, color: colors.hpWarning },
  heroMeta: { paddingVertical: 10, paddingHorizontal: 16 },
  noCharCard: { alignItems: 'center', borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: radius.xl },
  disabledEditor: { opacity: 0.55 },
  bodySection: { gap: spacing.xs },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  deleteBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerContainer + '44', borderBottomWidth: 1, borderBottomColor: colors.hpDanger + '33' },
  deleteBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.lg },
  deleteBannerConfirm: { borderWidth: 1, borderColor: colors.hpDanger + '55' },
});
