import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Pressable, StyleSheet, ActivityIndicator, Platform,
  Modal, ScrollView, useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { runAssistantTurn, type ChatMessage } from '@vaultstone/ai';
import { useAiChatStore, selectCampaignMessages } from '@vaultstone/store';
import {
  colors, spacing, radius, Text, Input, GhostButton, MarkdownText,
} from '@vaultstone/ui';
import type { AiChatSeed } from './AiChatContext';

export type PanelPos = { x: number; y: number };

interface Props {
  seed: AiChatSeed;
  position?: PanelPos | null;
  onPositionChange?: (pos: PanelPos) => void;
  onClose: () => void;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const PANEL_W = 420;

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
  seed, position: externalPos, onPositionChange, onClose,
}: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isMobile = screenW < 768;

  const messages = useAiChatStore(selectCampaignMessages(seed.campaignId));
  const addMessage = useAiChatStore((s) => s.addMessage);
  const clearCampaign = useAiChatStore((s) => s.clearCampaign);
  const disclosureAccepted = useAiChatStore((s) => s.disclosureAccepted);
  const acceptDisclosure = useAiChatStore((s) => s.acceptDisclosure);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const defaultPos = { x: screenW - PANEL_W - 24, y: screenH - 560 };
  const pos = externalPos ?? defaultPos;
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
    const nx = clamp(e.clientX - dragOffset.current.dx, 0, screenW - PANEL_W);
    const ny = clamp(e.clientY - dragOffset.current.dy, 0, screenH - 100);
    setPos({ x: nx, y: ny });
  }, [screenW, screenH, setPos]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
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
    setSending(true);
    try {
      const result = await runAssistantTurn(next, seed);
      addMessage(seed.campaignId, { id: newId(), role: 'assistant', text: result.text });
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, addMessage, seed]);

  const examples = seed.role === 'dm' ? DM_PROMPTS : PLAYER_PROMPTS;

  const panelContent = (
    <View style={[
      styles.panel,
      isMobile ? styles.panelMobile : { width: PANEL_W, maxHeight: screenH * 0.72 },
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
        style={styles.body}
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
    </View>
  );

  if (isMobile) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.mobileSheet}>
            {panelContent}
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return (
    <View style={[styles.floatingWrap, { left: pos.x, top: pos.y }]}>
      {panelContent}
    </View>
  );
}

const styles = StyleSheet.create({
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  mobileSheet: {
    maxHeight: '85%',
  },
});
