import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  createTimelineEvent,
  getEventBySourceSession,
  getWorldsForCampaign,
} from '@vaultstone/api';
import { markdownToTiptap, markdownToPlainText } from '@vaultstone/content';
import type { Json } from '@vaultstone/types';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

type Props = {
  campaignId: string;
  sessionId: string;
  sessionLabel: string;
  publishedSummary: string;
};

type WorldInfo = {
  worldId: string;
  worldName: string;
  primaryTimelinePageId: string;
};

export function AddToWorldTimelineButton({
  campaignId,
  sessionId,
  sessionLabel,
  publishedSummary,
}: Props) {
  const [worldInfo, setWorldInfo] = useState<WorldInfo | null>(null);
  const [alreadyLinked, setAlreadyLinked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: links } = await getWorldsForCampaign(campaignId);
      if (cancelled) return;

      const worlds = (links ?? [])
        .map((link) => link.worlds as unknown as {
          id: string;
          name: string;
          primary_timeline_page_id: string | null;
        })
        .filter(Boolean);

      const withTimeline = worlds.find((w) => w.primary_timeline_page_id);
      if (!withTimeline || !withTimeline.primary_timeline_page_id) {
        setLoading(false);
        return;
      }

      setWorldInfo({
        worldId: withTimeline.id,
        worldName: withTimeline.name,
        primaryTimelinePageId: withTimeline.primary_timeline_page_id,
      });

      const { data: existing } = await getEventBySourceSession(
        withTimeline.primary_timeline_page_id,
        sessionId,
      );
      if (cancelled) return;
      if (existing) setAlreadyLinked(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [campaignId, sessionId]);

  const handleAdd = useCallback(async () => {
    if (!worldInfo || saving || alreadyLinked || done) return;
    setSaving(true);

    const tiptapBody = markdownToTiptap(publishedSummary);
    const plainText = markdownToPlainText(publishedSummary);

    await createTimelineEvent({
      timelinePageId: worldInfo.primaryTimelinePageId,
      worldId: worldInfo.worldId,
      title: sessionLabel,
      body: tiptapBody as Json,
      bodyText: plainText,
      sourceSessionId: sessionId,
    });

    setSaving(false);
    setDone(true);
  }, [worldInfo, saving, alreadyLinked, done, publishedSummary, sessionLabel, sessionId]);

  if (loading || !worldInfo) return null;

  const disabled = alreadyLinked || done || saving;
  const label = alreadyLinked
    ? 'On timeline'
    : done
      ? 'Added'
      : saving
        ? 'Adding…'
        : `Add to ${worldInfo.worldName} timeline`;

  return (
    <Pressable
      onPress={handleAdd}
      disabled={disabled}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Icon
        name={alreadyLinked || done ? 'check' : 'event'}
        size={14}
        color={disabled ? colors.outlineVariant : colors.cosmic}
      />
      <Text
        variant="label-sm"
        style={{ color: disabled ? colors.outlineVariant : colors.cosmic, fontSize: 12 }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.cosmic + '44',
  },
  disabled: {
    opacity: 0.5,
  },
});
