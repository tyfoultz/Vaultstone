import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  claimPageEdit,
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
  Card,
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
import { StructuredFieldsForm } from './StructuredFieldsForm';
import { WikiRightPanel } from './WikiRightPanel';
import { WorldTopBar } from './WorldTopBar';
import { usePageVisibilityToggle } from './usePageVisibilityToggle';
import { worldHref, worldPageHref, worldSectionHref } from './worldHref';

const LOCK_HEARTBEAT_MS = 30_000;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  page: WorldPage;
  worldId: string;
};

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

export function NPCPageView({ page, worldId }: Props) {
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

  const section = useMemo(() => sections.find((s) => s.id === page.section_id) ?? null, [sections, page]);
  const template = getTemplate(page.template_key as TemplateKey, page.template_version);
  const fields = (page.structured_fields as Record<string, unknown>) ?? {};

  const role = typeof fields.role === 'string' ? fields.role : '';
  const threat = typeof fields.threat === 'string' ? fields.threat : '';
  const species = typeof fields.species === 'string' ? fields.species : '';

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

  return (
    <View style={styles.root}>
      <WorldTopBar
        crumbs={[
          { key: 'world', label: world?.name ?? '' },
          { key: 'section', label: section?.name ?? 'NPCs' },
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
                  <Text variant="label-md" uppercase weight="semibold" style={{ color: colors.onSurfaceVariant, letterSpacing: 1, fontSize: 11 }}>Share</Text>
                </Pressable>
                <Pressable onPress={handleDeletePage} hitSlop={8}>
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
          <Text variant="body-sm" style={{ color: colors.hpDanger, flex: 1 }}>Delete this page? Recoverable for 30 days.</Text>
          <Pressable onPress={() => setConfirmDelete(false)} style={styles.deleteBannerBtn}>
            <Text variant="label-md" weight="semibold" style={{ color: colors.onSurfaceVariant }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={handleDeletePage} style={[styles.deleteBannerBtn, { borderWidth: 1, borderColor: colors.hpDanger + '55' }]}>
            <Icon name="delete" size={14} color={colors.hpDanger} />
            <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>Confirm</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.wikiWrap}>
        <ScrollView style={styles.wikiDoc} contentContainerStyle={styles.wikiDocInner}>
          {/* NPC Head: portrait + name + meta stats */}
          <View style={styles.npcHead}>
            <LinearGradient
              colors={[colors.dangerContainer, colors.surfaceContainerLowest]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.portrait}
            >
              <Text style={styles.portraitText}>{getInitials(page.title)}</Text>
            </LinearGradient>

            <View style={styles.npcInfo}>
              <Text variant="display-md" family="serif-display" weight="medium" style={styles.npcName}>
                {page.title}
              </Text>
              {role ? (
                <Text variant="title-sm" family="serif-body" style={styles.npcRole}>
                  {role}
                </Text>
              ) : null}
              <View style={styles.npcStats}>
                {threat ? (
                  <View style={styles.npcStat}>
                    <Text style={styles.npcStatLabel}>THREAT</Text>
                    <Text style={[styles.npcStatValue, { color: THREAT_COLOR[threat] ?? colors.onSurface }]}>
                      {threat.charAt(0).toUpperCase() + threat.slice(1)}
                    </Text>
                  </View>
                ) : null}
                {species ? (
                  <View style={styles.npcStat}>
                    <Text style={styles.npcStatLabel}>SPECIES</Text>
                    <Text style={styles.npcStatValue}>{species}</Text>
                  </View>
                ) : null}
                <View style={styles.npcStat}>
                  <Text style={styles.npcStatLabel}>VISIBILITY</Text>
                  <VisibilityBadge
                    visibility={page.visible_to_players ? 'player' : 'gm'}
                    interactive={!!toggleVisibility}
                    onPress={toggleVisibility ?? undefined}
                  />
                </View>
              </View>
            </View>
          </View>

          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            {bannerLock ? (
              <EditLockBanner ownerUserId={bannerLock.ownerId} lockedSinceIso={bannerLock.since} onRetry={tryClaim} />
            ) : null}

            <View
              style={heldByOther ? styles.disabledEditor : undefined}
              pointerEvents={heldByOther ? 'none' : 'auto'}
            >
              {/* Two-column body: left = editor, right = facts */}
              <View style={styles.npcColumns}>
                <View style={styles.npcMainCol}>
                  <MetaLabel size="sm" tone="muted" style={{ marginBottom: spacing.xs }}>
                    Lore & Description
                  </MetaLabel>
                  <BodyEditor
                    initialContent={(page.body as object) ?? null}
                    onChange={handleBodyChange}
                    editable={!heldByOther}
                    placeholder={`Describe ${page.title}…`}
                    worldId={worldId}
                    pageId={page.id}
                    mentionablePages={mentionablePages}
                    onMentionClick={(targetPageId) => router.push(worldPageHref(worldId, targetPageId))}
                  />
                </View>

                <View style={styles.npcSideCol}>
                  <StructuredFieldsForm page={page} template={template} onSaveStateChange={setSaveState} />

                  {/* Secrets panel (GM-only note) */}
                  {typeof fields.visibility_note === 'string' && fields.visibility_note.trim() ? (
                    <View style={styles.secretPanel}>
                      <View style={styles.secretHeader}>
                        <Icon name="visibility-off" size={12} color={colors.hpWarning} />
                        <Text style={styles.secretLabel}>GM SECRET</Text>
                      </View>
                      <Text variant="body-sm" family="serif-body" style={styles.secretText}>
                        {fields.visibility_note}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

        <WikiRightPanel pageId={page.id} worldId={worldId} />
      </View>

      {shareOpen ? <ShareModal page={page} onClose={() => setShareOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  wikiWrap: { flex: 1, flexDirection: 'row', minHeight: 0 },
  wikiDoc: { flex: 1, backgroundColor: colors.surfaceCanvas },
  wikiDocInner: { maxWidth: 1100, paddingTop: 28, paddingHorizontal: 36, paddingBottom: 64, alignSelf: 'center', width: '100%' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.outlineVariant + '55' },
  deleteBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.dangerContainer + '44', borderBottomWidth: 1, borderBottomColor: colors.hpDanger + '33' },
  deleteBannerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.lg },
  disabledEditor: { opacity: 0.55 },

  // NPC head
  npcHead: { flexDirection: 'row', gap: 22, alignItems: 'flex-start' },
  portrait: {
    width: 120,
    height: 160,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  portraitText: {
    fontFamily: fonts.label,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.outline,
    textTransform: 'uppercase',
  },
  npcInfo: { flex: 1, gap: 4 },
  npcName: { color: colors.onSurface, fontSize: 40, lineHeight: 42, letterSpacing: -0.6 },
  npcRole: { color: colors.onSurfaceVariant, fontStyle: 'italic', fontSize: 18 },
  npcStats: { flexDirection: 'row', gap: 24, marginTop: spacing.md },
  npcStat: { gap: 2 },
  npcStatLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.2, color: colors.outline },
  npcStatValue: { fontFamily: fonts.headline, fontSize: 18, fontWeight: '500', color: colors.onSurface },

  // Two-column body
  npcColumns: { flexDirection: 'row', gap: spacing.lg },
  npcMainCol: { flex: 2, gap: spacing.xs },
  npcSideCol: { flex: 1, gap: spacing.lg },

  // Secret panel
  secretPanel: {
    padding: 12,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hpWarning + '33',
    backgroundColor: colors.gmContainer + '22',
  },
  secretHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  secretLabel: { fontFamily: fonts.label, fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: colors.hpWarning },
  secretText: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 20 },
});
