import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Pressable, StyleSheet, ActivityIndicator, Platform,
  Modal, ScrollView, Switch, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { runAssistantTurn, type ChatMessage } from '@vaultstone/ai';
import { getCampaignById, updateAiSettings } from '@vaultstone/api';
import { useAiChatStore, selectCampaignMessages } from '@vaultstone/store';
import {
  colors, spacing, radius, Text, Input, GhostButton, MarkdownText, useAutoGrow,
} from '@vaultstone/ui';
import type { AiChatSeed } from './AiChatContext';

export type PanelPos = { x: number; y: number };
export type PanelSize = { w: number; h: number };

interface Props {
  seed: AiChatSeed;
  position?: PanelPos | null;
  onPositionChange?: (pos: PanelPos) => void;
  size?: PanelSize | null;
  onSizeChange?: (size: PanelSize) => void;
  /** Show the DM's "let players use the assistant" toggle. Only the campaign
   *  surface passes this — the world/character hosts keep the panel clean. */
  showPlayerAccessToggle?: boolean;
  /** When false the panel is hidden but stays mounted, so an in-flight
   *  assistant turn keeps running while minimized. Defaults to true. */
  visible?: boolean;
  onClose: () => void;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const PANEL_W = 420;
const PANEL_MIN_W = 340;
const PANEL_MIN_H = 360;
const PANEL_DEFAULT_H = 560;

// Last-known playerAccessEnabled per campaign, so reopening the panel renders
// the toggle in its real state instead of flashing off → on while the fresh
// value loads.
const playerAccessCache = new Map<string, boolean>();

const DM_PROMPTS = [
  'Brainstorm a hook for tonight’s session',
  'How does grappling work?',
  'Suggest 3 NPCs for a harbor town',
];
const PLAYER_PROMPTS = [
  'What can my character do this turn?',
  'How does the Help action work?',
  'Summarize what I know about the world',
];

export function AiChatOverlay({
  seed, position: externalPos, onPositionChange,
  size: externalSize, onSizeChange, showPlayerAccessToggle,
  visible = true, onClose,
}: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isMobile = screenW < 768;

  const messages = useAiChatStore(selectCampaignMessages(seed.campaignId));
  const addMessage = useAiChatStore((s) => s.addMessage);
  const clearCampaign = useAiChatStore((s) => s.clearCampaign);
  const disclosureAccepted = useAiChatStore((s) => s.disclosureAccepted);
  const acceptDisclosure = useAiChatStore((s) => s.acceptDisclosure);

  const [input, setInput] = useState('');
  // The composer drives its own height (it clamps to a max), so `Input`'s
  // built-in auto-grow is off and this hook supplies the measurement —
  // including the web correction that lets the box shrink back down.
  const composer = useAutoGrow({ minHeight: 20 });
  const [sending, setSending] = useState(false);
  const [playerAccess, setPlayerAccess] = useState(
    () => playerAccessCache.get(seed.campaignId) ?? false,
  );
  const scrollRef = useRef<ScrollView>(null);

  // DM-only (campaign surface): load + toggle player access for the campaign.
  useEffect(() => {
    if (!showPlayerAccessToggle || seed.role !== 'dm') return;
    let cancelled = false;
    getCampaignById(seed.campaignId).then(({ data }) => {
      if (cancelled || !data) return;
      const s = (data.ai_settings ?? {}) as { playerAccessEnabled?: boolean };
      playerAccessCache.set(seed.campaignId, !!s.playerAccessEnabled);
      setPlayerAccess(!!s.playerAccessEnabled);
    });
    return () => { cancelled = true; };
  }, [showPlayerAccessToggle, seed.role, seed.campaignId]);

  const togglePlayerAccess = useCallback(async (v: boolean) => {
    playerAccessCache.set(seed.campaignId, v);
    setPlayerAccess(v);
    await updateAiSettings(seed.campaignId, { playerAccessEnabled: v });
  }, [seed.campaignId]);

  // The panel floats inside its host container (which may be narrower than the
  // window — e.g. the world content column next to the sidebar), so bounds come
  // from measuring an inset layer, not from the window dimensions.
  const [layer, setLayer] = useState<{ w: number; h: number } | null>(null);
  const layerW = layer?.w ?? screenW;
  const layerH = layer?.h ?? screenH;

  // Size — host-persisted when provided (mirrors the position props), with an
  // internal fallback so resizing still works on hosts that don't lift it.
  const [internalSize, setInternalSize] = useState<PanelSize | null>(null);
  const size = externalSize ?? internalSize;
  const setSize = useCallback((next: PanelSize) => {
    if (onSizeChange) onSizeChange(next);
    else setInternalSize(next);
  }, [onSizeChange]);

  const panelW = clamp(
    size?.w ?? PANEL_W,
    PANEL_MIN_W,
    Math.max(PANEL_MIN_W, layerW - 16),
  );
  const panelH = clamp(
    size?.h ?? Math.min(PANEL_DEFAULT_H, layerH - 48),
    PANEL_MIN_H,
    Math.max(PANEL_MIN_H, layerH - 16),
  );

  // Clamp at render time so a stale stored position (or a container that
  // shrank) can never strand the panel outside the visible bounds.
  const defaultPos = { x: layerW - panelW - 24, y: layerH - panelH - 24 };
  const rawPos = externalPos ?? defaultPos;
  const pos = {
    x: clamp(rawPos.x, 0, Math.max(0, layerW - panelW)),
    y: clamp(rawPos.y, 0, Math.max(0, layerH - panelH)),
  };
  const dragging = useRef(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });

  const setPos = useCallback((next: PanelPos) => {
    onPositionChange?.(next);
  }, [onPositionChange]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isMobile) return;
    dragging.current = true;
    dragOffset.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [isMobile, pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const nx = clamp(e.clientX - dragOffset.current.dx, 0, Math.max(0, layerW - panelW));
    const ny = clamp(e.clientY - dragOffset.current.dy, 0, Math.max(0, layerH - panelH));
    setPos({ x: nx, y: ny });
  }, [layerW, layerH, panelW, panelH, setPos]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Corner resize — same pointer-capture pattern as dragging.
  const resizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const onResizeDown = useCallback((e: React.PointerEvent) => {
    if (isMobile) return;
    resizing.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: panelW, h: panelH };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  }, [isMobile, panelW, panelH]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const w = clamp(
      resizeStart.current.w + (e.clientX - resizeStart.current.x),
      PANEL_MIN_W,
      Math.max(PANEL_MIN_W, layerW - pos.x - 8),
    );
    const h = clamp(
      resizeStart.current.h + (e.clientY - resizeStart.current.y),
      PANEL_MIN_H,
      Math.max(PANEL_MIN_H, layerH - pos.y - 8),
    );
    setSize({ w, h });
  }, [layerW, layerH, pos.x, pos.y, setSize]);

  const onResizeUp = useCallback(() => {
    resizing.current = false;
  }, []);

  useEffect(() => {
    // Auto-scroll to the newest message.
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    const userMsg: ChatMessage = { id: newId(), role: 'user', text };
    const next = [...messages, userMsg];
    addMessage(seed.campaignId, userMsg);
    setInput('');
    composer.reset();
    setSending(true);
    try {
      const result = await runAssistantTurn(next, seed);
      addMessage(seed.campaignId, { id: newId(), role: 'assistant', text: result.text });
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, addMessage, seed, composer.reset]);

  const examples = seed.role === 'dm' ? DM_PROMPTS : PLAYER_PROMPTS;

  const panelContent = (
    <View style={[
      styles.panel,
      isMobile
        ? styles.panelMobile
        : size
          ? { width: panelW, height: panelH }
          : { width: panelW, maxHeight: layerH * 0.72 },
    ]}>
      {/* Header — drag handle on web */}
      <View
        style={[styles.header, !isMobile && styles.headerDraggable]}
        {...(Platform.OS === 'web' && !isMobile ? {
          onPointerDown: onPointerDown as any,
          onPointerMove: onPointerMove as any,
          onPointerUp: onPointerUp as any,
        } : {})}
      >
        <MaterialCommunityIcons name="robot-happy-outline" size={18} color={colors.primary} />
        <Text variant="label-md" weight="bold" style={{ color: colors.onSurface, flex: 1 }}>
          Assistant
        </Text>
        {messages.length > 0 ? (
          <Pressable onPress={() => clearCampaign(seed.campaignId)} style={styles.iconBtn} hitSlop={8}>
            <MaterialCommunityIcons name="broom" size={17} color={colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={8}>
          <MaterialCommunityIcons name="window-minimize" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      {/* DM control — let players use the assistant in this campaign.
          Campaign surface only; world/character hosts don't render it. */}
      {showPlayerAccessToggle && seed.role === 'dm' ? (
        <View style={styles.accessRow}>
          <MaterialCommunityIcons name="account-group-outline" size={15} color={colors.onSurfaceVariant} />
          <Text variant="label-sm" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
            Let players use the assistant
          </Text>
          <Switch
            value={playerAccess}
            onValueChange={togglePlayerAccess}
            trackColor={{ true: colors.primary, false: colors.outlineVariant }}
          />
        </View>
      ) : null}

      {/* Disclosure (until acknowledged) */}
      {!disclosureAccepted ? (
        <View style={styles.disclosure}>
          <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
            Messages are sent to Google&rsquo;s Gemini API to generate replies. On the free
            tier, Google may use this content to improve their models. Avoid sharing anything
            you wouldn&rsquo;t want processed by Google.
          </Text>
          <View style={{ alignSelf: 'flex-end', marginTop: spacing.xs }}>
            <GhostButton label="Got it" onPress={acceptDisclosure} />
          </View>
        </View>
      ) : null}

      {/* Message list */}
      <ScrollView
        ref={scrollRef}
        style={[styles.body, !size && styles.bodyCapped]}
        contentContainerStyle={{ paddingBottom: spacing.md, gap: spacing.sm }}
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="body-sm" style={{ color: colors.onSurfaceVariant, marginBottom: spacing.sm }}>
              Ask about rules, your world, characters, or session prep. Try:
            </Text>
            {examples.map((ex) => (
              <Pressable key={ex} style={styles.exampleChip} onPress={() => setInput(ex)}>
                <Text variant="label-sm" style={{ color: colors.primary }}>{ex}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={[
                styles.bubble,
                m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
              ]}
            >
              {m.role === 'assistant' ? (
                <MarkdownText variant="body-sm" style={{ color: colors.onSurface }}>
                  {m.text}
                </MarkdownText>
              ) : (
                <Text variant="body-sm" style={{ color: colors.onSurface }}>{m.text}</Text>
              )}
            </View>
          ))
        )}
        {sending ? (
          <View style={[styles.bubble, styles.bubbleAssistant, styles.thinking]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>Thinking…</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Composer */}
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Input
            value={input}
            onChangeText={setInput}
            placeholder="Ask the assistant…"
            onSubmitEditing={send}
            returnKeyType="send"
            editable={!sending}
            multiline
            onContentSizeChange={composer.onContentSizeChange}
            onChange={composer.onChange}
            style={{ height: clamp(composer.height ?? 20, 20, 120) }}
          />
        </View>
        <Pressable
          onPress={send}
          disabled={sending || input.trim().length === 0}
          style={[
            styles.sendBtn,
            (sending || input.trim().length === 0) && { opacity: 0.4 },
          ]}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="send" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>

      {/* Corner resize handle — web desktop only */}
      {Platform.OS === 'web' && !isMobile ? (
        <View
          style={styles.resizeHandle}
          {...({
            onPointerDown: onResizeDown as any,
            onPointerMove: onResizeMove as any,
            onPointerUp: onResizeUp as any,
          } as any)}
        >
          <MaterialCommunityIcons
            name="resize-bottom-right"
            size={14}
            color={colors.onSurfaceVariant}
          />
        </View>
      ) : null}
    </View>
  );

  if (isMobile) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.mobileSheet}>
            {panelContent}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Full-size measuring layer: gives the panel its real container bounds for
  // clamping while letting pointer events pass through the empty space.
  // `display: none` (not unmount) when minimized so in-flight turns continue.
  return (
    <View
      style={[styles.overlayLayer, !visible && styles.overlayHidden]}
      pointerEvents="box-none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayer({ w: width, h: height });
      }}
    >
      <View style={[styles.floatingWrap, { left: pos.x, top: pos.y }]}>
        {panelContent}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    ...(Platform.OS === 'web' ? ({ zIndex: 100 } as any) : {}),
  },
  overlayHidden: {
    display: 'none',
  },
  floatingWrap: {
    position: 'absolute',
    zIndex: 100,
    ...Platform.select({
      web: { boxShadow: '0 8px 32px rgba(0,0,0,0.5)' } as any,
    }),
  },
  panel: {
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    overflow: 'hidden',
  },
  panelMobile: {
    flex: 1,
    borderRadius: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  headerDraggable: {
    ...Platform.select({
      web: { cursor: 'grab', userSelect: 'none' } as any,
    }),
  },
  iconBtn: { padding: 4 },
  accessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  disclosure: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceContainer,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    minHeight: 200,
  },
  bodyCapped: {
    maxHeight: 440,
  },
  empty: {
    paddingVertical: spacing.md,
  },
  exampleChip: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    marginBottom: spacing.xs,
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    maxWidth: '92%',
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primaryContainer + '55',
  },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceContainer,
  },
  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resizeHandle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    padding: 3,
    ...(Platform.OS === 'web'
      ? ({ cursor: 'nwse-resize', zIndex: 10 } as any)
      : {}),
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  mobileSheet: {
    maxHeight: '85%',
  },
});
