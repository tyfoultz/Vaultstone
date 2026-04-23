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

type Props = {
  world: World;
  worldId: string;
  isOwner: boolean;
  systemLabel?: string | null;
  partyLevel?: number | null;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function WorldOpeningBlock({ world, worldId, isOwner, systemLabel, partyLevel }: Props) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const patchWorld = useCurrentWorldStore((s) => s.patchWorld);
  const pagesByWorld = usePagesStore((s) => (worldId ? s.byWorldId[worldId] : undefined));

  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(world.opening_title ?? 'Opening · Read Aloud');
  const [bodyDraft, setBodyDraft] = useState<{ body: object; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const mentionablePages = useMemo(() => pagesByWorld ?? [], [pagesByWorld]) as WorldPage[];

  const metaParts = useMemo(() => {
    const parts: string[] = [];
    if (systemLabel) parts.push(systemLabel);
    if (partyLevel != null) parts.push(`Level ${partyLevel} Party`);
    if (world.opening_updated_at) {
      parts.push(`Edited ${timeAgo(world.opening_updated_at)} by you`);
    }
    return parts;
  }, [systemLabel, partyLevel, world.opening_updated_at]);

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
      opening_title: titleDraft.trim() || 'Opening · Read Aloud',
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
    setTitleDraft(world.opening_title ?? 'Opening · Read Aloud');
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
          {world.opening_title ?? 'Opening · Read Aloud'}
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
        <View style={styles.prose}>
          <BodyEditor
            initialContent={world.opening_body as object | null}
            onChange={() => {}}
            editable={false}
            worldId={worldId}
            mentionablePages={mentionablePages}
            onMentionClick={handleMentionClick}
          />
        </View>
      ) : isOwner ? (
        <Pressable onPress={() => setEditing(true)} style={styles.emptyState}>
          <Icon name="edit-note" size={20} color={colors.outline} />
          <Text variant="body-md" style={{ color: colors.outline, fontStyle: 'italic' }}>
            Add an opening passage for your world…
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.metaRow}>
          {metaParts.map((part, i) => (
            <View key={i} style={styles.metaItem}>
              {i === 0 && <Icon name="settings" size={12} color={colors.onSurfaceVariant} />}
              {i === 1 && <Icon name="groups" size={12} color={colors.onSurfaceVariant} />}
              {i === 2 && <Icon name="schedule" size={12} color={colors.onSurfaceVariant} />}
              <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                {part}
              </Text>
            </View>
          ))}
        </View>

        {isOwner ? (
          editing ? (
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
          )
        ) : null}
      </View>
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
  prose: {
    minHeight: 40,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
    borderStyle: 'dotted',
    paddingTop: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
