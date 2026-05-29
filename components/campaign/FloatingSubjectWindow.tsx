import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { supabase, getCampaignWindowPane, type WindowPaneSlot } from '@vaultstone/api';
import { colors, fonts, Icon, radius, spacing, Text } from '@vaultstone/ui';

type Props = {
  campaignId: string;
  isDM: boolean;
  /** Initial subject from the parent's first fetch — avoids a double-load. */
  initialSubject: WindowPaneSlot | null;
};

export function FloatingSubjectWindow({ campaignId, isDM, initialSubject }: Props) {
  const [subject, setSubject] = useState<WindowPaneSlot | null>(initialSubject);
  const [dismissed, setDismissed] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // Dragging state (web only)
  const [pos, setPos] = useState({ x: 20, y: 20 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Sync initial subject from parent when it changes (e.g. first load)
  useEffect(() => {
    if (initialSubject) {
      setSubject(initialSubject);
      setDismissed(false);
    }
  }, [initialSubject?.imageId]);

  // Realtime: watch campaign row for subject_image_id changes
  useEffect(() => {
    const suffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`campaign-subject-${campaignId}-${suffix}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
        async (payload) => {
          const newSubjectId = (payload.new as { subject_image_id?: string | null }).subject_image_id;
          if (!newSubjectId) {
            setSubject(null);
            return;
          }
          const { data } = await getCampaignWindowPane(campaignId);
          if (data?.subject) {
            setSubject(data.subject);
            setDismissed(false);
          } else {
            setSubject(null);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [campaignId]);

  const handlePointerDown = useCallback((e: any) => {
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
    };
    const handleMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, dragRef.current.originX + dx),
        y: Math.max(0, dragRef.current.originY + dy),
      });
    };
    const handleUp = () => {
      dragRef.current = null;
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [pos.x, pos.y]);

  if (Platform.OS !== 'web') return null;
  if (!subject || dismissed) return null;

  if (minimized) {
    return (
      <View style={[s.minimizedPill, { left: pos.x, top: pos.y }]}>
        <Pressable
          onPress={() => setMinimized(false)}
          style={s.minimizedBody}
        >
          <Icon name="person" size={14} color={colors.primary} />
          <Text style={s.minimizedText} numberOfLines={1}>
            {subject.caption || 'Subject'}
          </Text>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} style={s.minimizedClose} hitSlop={4}>
          <Icon name="close" size={12} color={colors.outline} />
        </Pressable>
      </View>
    );
  }

  const aspect = subject.width && subject.height
    ? Math.max(subject.width / subject.height, 0.5)
    : 9 / 16;
  const windowWidth = 220;
  const windowHeight = windowWidth / aspect;

  return (
    <View
      style={[s.floatingWindow, { left: pos.x, top: pos.y, width: windowWidth }]}
    >
      {/* Title bar — draggable */}
      <View
        // @ts-expect-error -- RN Web supports pointer events + cursor
        style={[s.titleBar, { cursor: 'grab' }]}
        onPointerDown={handlePointerDown}
      >
        <Icon name="drag-indicator" size={14} color={colors.outline} />
        <Text style={s.titleText} numberOfLines={1}>
          {subject.caption || 'Subject'}
        </Text>
        <Pressable onPress={() => setMinimized(true)} hitSlop={4} style={s.titleBtn}>
          <Icon name="remove" size={14} color={colors.onSurfaceVariant} />
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} hitSlop={4} style={s.titleBtn}>
          <Icon name="close" size={14} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* Image body */}
      <View style={[s.imageFrame, { height: windowHeight }]}>
        <Image
          source={{ uri: subject.signedUrl }}
          style={s.image}
          resizeMode="cover"
          accessibilityLabel={subject.alt}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  floatingWindow: {
    position: 'absolute',
    zIndex: 100,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 12,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 5,
    backgroundColor: colors.surfaceContainerHigh,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '55',
  },
  titleText: {
    flex: 1,
    fontFamily: fonts.label,
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
  titleBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  imageFrame: {
    width: '100%',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  minimizedPill: {
    position: 'absolute',
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerHigh,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 4,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  minimizedBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  minimizedText: {
    fontFamily: fonts.label,
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurface,
    maxWidth: 120,
  },
  minimizedClose: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
});
