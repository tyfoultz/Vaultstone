import { createContext, useContext, useRef, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  colors, spacing, radius,
  Icon, Text,
} from '@vaultstone/ui';

/**
 * Generic centered/full-bleed modal for content-detail views (classes,
 * species, items, etc.). Provides a sticky header with title + close,
 * an optional hero stats strip, optional anchor pills that scroll to
 * sections inside the body, and a scrollable content area.
 *
 * Children compose the body. Wrap each anchor-able section in
 * `<DetailSection id={...}>` so the pills know where to scroll.
 */

export type DetailModalAnchor = { id: string; label: string };
export type DetailModalStat = { label: string; value: string };

export type DetailModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Sticky header title (e.g. class name). */
  title: string;
  /** Optional flavor / description sentence shown under the header. */
  subtitle?: string;
  /** Optional hero stats strip rendered below the subtitle (1–4 tiles). */
  heroStats?: DetailModalStat[];
  /**
   * Optional anchor pills. When clicked, the body scrolls to the
   * `<DetailSection id={...}>` registered under the same id.
   */
  anchors?: DetailModalAnchor[];
  /**
   * Optional content rendered between the sticky title row and the
   * anchor bar. Used for source-variant chips on classes — sits with
   * the chrome rather than the body so it stays visible as the user
   * scrolls inside a tab.
   */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
};

type SectionRegistry = {
  recordSection: (id: string, y: number) => void;
};

const DetailModalContext = createContext<SectionRegistry | null>(null);

export function DetailModal({
  visible, onClose, title, subtitle, heroStats, anchors, headerExtra, children,
}: DetailModalProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 720;
  const scrollRef = useRef<ScrollView | null>(null);
  const sectionPositions = useRef<Map<string, number>>(new Map());
  const [activeAnchor, setActiveAnchor] = useState<string | null>(anchors?.[0]?.id ?? null);

  function recordSection(id: string, y: number) {
    sectionPositions.current.set(id, y);
  }

  function jumpTo(id: string) {
    const y = sectionPositions.current.get(id);
    if (y == null) return;
    // Small offset so the section title isn't flush against the sticky chrome above.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    setActiveAnchor(id);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.backdrop, isWide ? s.backdropDesktop : s.backdropMobile]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View
          style={[s.sheet, isWide ? s.sheetDesktop : s.sheetMobile]}
          // Catch presses on the sheet so they don't bubble to the backdrop.
          onStartShouldSetResponder={() => true}
        >
          {/* Sticky header */}
          <View style={s.stickyHeader}>
            <Text variant="title-md" family="headline" weight="bold" style={s.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Icon name="close" size={20} color={colors.outline} />
            </Pressable>
          </View>

          {/* Header extras (e.g. source-variant chips) — pinned under
              the title, above the anchor bar. Sits with the modal chrome
              rather than the scrollable body. */}
          {headerExtra ? <View style={s.headerExtra}>{headerExtra}</View> : null}

          {/* Anchor pills — pinned under the sticky header so they stay
              accessible while the body scrolls. Sits outside the body
              ScrollView so it doesn't move with the content. */}
          {anchors && anchors.length > 0 ? (
            <View style={s.anchorBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.anchorRow}
                style={s.anchorScroll}
              >
                {anchors.map((a) => {
                  const isActive = activeAnchor === a.id;
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => jumpTo(a.id)}
                      style={({ pressed }) => [
                        s.anchorPill,
                        isActive && s.anchorPillActive,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Text
                        variant="body-sm"
                        family="body"
                        weight={isActive ? 'bold' : 'medium'}
                        style={{ color: isActive ? colors.onPrimaryContainer : colors.onSurfaceVariant }}
                      >
                        {a.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          <ScrollView
            ref={scrollRef}
            style={s.body}
            contentContainerStyle={s.bodyContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Subtitle / description — split on blank lines so each paragraph
                renders as its own Text with proper gap. */}
            {subtitle ? (
              <View style={s.subtitleBlock}>
                {subtitle.split(/\n\s*\n/).map((para, i) => (
                  <Text key={i} variant="body-md" family="body" style={s.subtitle}>
                    {para.trim()}
                  </Text>
                ))}
              </View>
            ) : null}

            {/* Hero stats strip */}
            {heroStats && heroStats.length > 0 ? (
              <View style={s.heroStrip}>
                {heroStats.map((st) => (
                  <View key={st.label} style={s.heroTile}>
                    <Text variant="label-sm" weight="bold" uppercase style={s.heroLabel}>{st.label}</Text>
                    <Text variant="title-sm" family="headline" weight="bold" style={s.heroValue} numberOfLines={1}>
                      {st.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Body content */}
            <DetailModalContext.Provider value={{ recordSection }}>
              {children}
            </DetailModalContext.Provider>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Section wrapper that registers its `y` position with the enclosing
 * DetailModal so anchor pills can scroll to it. Render normal content
 * as children — usually a section header followed by its body.
 */
export function DetailSection({
  id, children, style,
}: {
  id: string;
  children: React.ReactNode;
  style?: any;
}) {
  const ctx = useContext(DetailModalContext);
  return (
    <View
      style={style}
      onLayout={(e: LayoutChangeEvent) => {
        ctx?.recordSection(id, e.nativeEvent.layout.y);
      }}
    >
      {children}
    </View>
  );
}

/**
 * Section header — primary-coloured small caps, used at the top of each
 * DetailSection. Optional id auto-registers with the parent context if
 * the surrounding DetailSection didn't.
 */
export function DetailSectionHeading({ children }: { children: string }) {
  return (
    <Text
      variant="label-md"
      weight="bold"
      uppercase
      style={s.sectionHeading}
    >
      {children}
    </Text>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  backdropDesktop: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backdropMobile: { padding: 0 },

  sheet: {
    backgroundColor: colors.surfaceContainerLow,
    overflow: 'hidden',
  },
  sheetDesktop: {
    width: '100%',
    maxWidth: 880,
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  sheetMobile: {
    flex: 1,
    width: '100%',
  },

  stickyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '88',
    backgroundColor: colors.surfaceContainer,
  },
  title: { flex: 1, color: colors.onSurface, marginRight: spacing.md },

  body: { flex: 1 },
  bodyContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },

  subtitleBlock: { gap: spacing.sm },
  subtitle: { color: colors.onSurfaceVariant, lineHeight: 22 },

  heroStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  heroTile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    gap: 2,
  },
  heroLabel: { color: colors.outline, letterSpacing: 1.25 },
  heroValue: { color: colors.onSurface },

  headerExtra: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surfaceContainer,
  },
  anchorBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainer,
  },
  anchorScroll: {
    flexGrow: 0,
  },
  anchorRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    paddingVertical: 2,
  },
  anchorPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  anchorPillActive: {
    backgroundColor: colors.primaryContainer + '55',
    borderColor: colors.primary + '88',
  },

  sectionHeading: {
    color: colors.primary,
    letterSpacing: 1.25,
    marginBottom: spacing.xs,
  },
});
