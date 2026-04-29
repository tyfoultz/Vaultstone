import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { updateWorld } from '@vaultstone/api';
import { useAuthStore, useCurrentWorldStore, usePagesStore } from '@vaultstone/store';
import type { Database, WorldPage } from '@vaultstone/types';
import { GhostButton, Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import { BodyEditor } from './BodyEditor';
import { worldPageHref } from './worldHref';

type World = Database['public']['Tables']['worlds']['Row'];

const DEFAULT_TITLE = 'World Description';
const COLLAPSED_MAX_HEIGHT = 130;

type Props = {
  world: World;
  worldId: string;
  isOwner: boolean;
};

export function WorldOpeningBlock({ world, worldId, isOwner }: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const patchWorld = useCurrentWorldStore((s) => s.patchWorld);
  const pagesByWorld = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));

  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [titleDraft, setTitleDraft] = useState(world.opening_title ?? DEFAULT_TITLE);
  const [bodyDraft, setBodyDraft] = useState<{ body: object; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const mentionablePages = useMemo(() => pagesByWorld ?? [], [pagesByWorld]) as WorldPage[];

  const handleBodyChange = useCallback((body: object, bodyText: string) => {
    setBodyDraft({ body, text: bodyText });
  }, []);

  const handleMentionClick = useCallback(
    (pageId: string) => router.push(worldPageHref(worldId, pageId)),
    [router, worldId],
  );

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const patch: Record<string, unknown> = {
      opening_title: titleDraft.trim() || DEFAULT_TITLE,
      opening_updated_at: new Date().toISOString(),
      opening_updated_by: user?.id ?? null,
    };
    if (bodyDraft) {
      patch.opening_body = bodyDraft.body;
      patch.opening_body_text = bodyDraft.text;
    }
    await updateWorld(worldId, patch as Parameters<typeof updateWorld>[1]);
    patchWorld(patch as Partial<World>);
    setSaving(false);
    setEditing(false);
  }

  function handleCancel() {
    setTitleDraft(world.opening_title ?? DEFAULT_TITLE);
    setBodyDraft(null);
    setEditing(false);
  }

  const hasContent = !!(world.opening_body || world.opening_body_text);

  if (!hasContent && !editing && !isOwner) return null;

  return (
    <View style={styles.root}>
      {editing ? (
        <TextInput
          style={styles.titleInput}
          value={titleDraft}
          onChangeText={setTitleDraft}
          placeholder="Block title…"
          placeholderTextColor={colors.outline}
          autoFocus
        />
      ) : (
        <Text
          variant="label-sm"
          weight="bold"
          uppercase
          style={styles.titleLabel}
        >
          {world.opening_title ?? DEFAULT_TITLE}
        </Text>
      )}

      {editing ? (
        <View style={styles.editorWrap}>
          <BodyEditor
            initialContent={world.opening_body as object | null}
            onChange={handleBodyChange}
            editable
            placeholder="Set the scene for your players…"
            worldId={worldId}
            mentionablePages={mentionablePages}
            onMentionClick={handleMentionClick}
          />
        </View>
      ) : hasContent ? (
        <View>
          <View style={[
            styles.prose,
            !expanded && styles.proseCollapsed,
          ]}>
            <BodyEditor
              initialContent={world.opening_body as object | null}
              onChange={() => {}}
              editable={false}
              hideChrome
              worldId={worldId}
              mentionablePages={mentionablePages}
              onMentionClick={handleMentionClick}
            />
          </View>
          {!expanded ? (
            <Pressable onPress={() => setExpanded(true)} style={styles.readMoreBtn}>
              <Text variant="label-sm" weight="semibold" style={{ color: colors.primary }}>
                Read More
              </Text>
              <Icon name="expand-more" size={16} color={colors.primary} />
            </Pressable>
          ) : (
            <Pressable onPress={() => setExpanded(false)} style={styles.readMoreBtn}>
              <Text variant="label-sm" weight="semibold" style={{ color: colors.primary }}>
                Show Less
              </Text>
              <Icon name="expand-less" size={16} color={colors.primary} />
            </Pressable>
          )}
        </View>
      ) : isOwner ? (
        <Pressable onPress={() => setEditing(true)} style={styles.emptyState}>
          <Icon name="edit-note" size={20} color={colors.outline} />
          <Text variant="body-md" style={{ color: colors.outline, fontStyle: 'italic' }}>
            Add a description for your world…
          </Text>
        </Pressable>
      ) : null}

      {isOwner ? (
        <View style={styles.footer}>
          {editing ? (
            <View style={styles.editActions}>
              <GhostButton label="Cancel" onPress={handleCancel} />
              <GhostButton label={saving ? 'Saving…' : 'Save'} onPress={handleSave} />
            </View>
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.editBtn}>
              <Icon name="edit" size={14} color={colors.onSurfaceVariant} />
              <Text variant="label-sm" weight="semibold" style={{ color: colors.onSurfaceVariant }}>
                Edit
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
    gap: spacing.md,
  },
  titleLabel: {
    color: colors.primary,
    letterSpacing: 1.5,
  },
  titleInput: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '44',
    paddingBottom: 4,
  } as object,
  editorWrap: {
    minHeight: 120,
  },
  prose: {},
  proseCollapsed: {
    maxHeight: COLLAPSED_MAX_HEIGHT,
    overflow: 'hidden',
  },
  readMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
    borderStyle: 'dotted',
    paddingTop: spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
});
