// "Start Session" picker. Two decisions in one sheet:
//   • Attendance — which players are at the table tonight. This is what
//     lands in `session_participants`, which is keyed by user, not by
//     character.
//   • Active character — which of a player's characters they're bringing.
//     A member can own several characters under one campaign, but only
//     the one pinned to `campaign_members.character_id` is "in play"
//     (party vitals, combat, session views all read the pin). Without a
//     picker here a second character was invisible and unreachable: the
//     roster join only ever surfaces the pinned one.
//
// The modal reports character picks as a diff against the current pin,
// so the parent only writes rows that actually changed.

import { useEffect, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Pressable, ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing } from '@vaultstone/ui';

export interface StartSessionCharacter {
  id: string;
  name: string;
  /** Short "L7 Rogue"-style line. Optional — omitted when unresolvable. */
  subtitle?: string | null;
}

export interface StartSessionPlayer {
  userId: string;
  displayName: string;
  /** Currently pinned character, or null when the player has none. */
  characterId: string | null;
  /** Every character this player owns under the campaign. */
  characters: StartSessionCharacter[];
}

export interface StartSessionResult {
  /** Members attending — written to `session_participants`. */
  userIds: string[];
  /** Only the members whose active character changed. */
  characterPicks: Array<{ userId: string; characterId: string }>;
}

interface Props {
  visible: boolean;
  players: StartSessionPlayer[];
  starting: boolean;
  onClose: () => void;
  onConfirm: (result: StartSessionResult) => void;
}

export function StartSessionModal({ visible, players, starting, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  // userId → chosen characterId. Seeded from the current pin, falling
  // back to the player's only character so a member who joined without
  // ever picking still starts with something selected.
  const [charChoice, setCharChoice] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!visible) return;
    const initialSelected: Record<string, boolean> = {};
    const initialChars: Record<string, string | null> = {};
    for (const p of players) {
      initialSelected[p.userId] = true;
      initialChars[p.userId] =
        p.characterId ?? (p.characters.length === 1 ? p.characters[0].id : null);
    }
    setSelected(initialSelected);
    setCharChoice(initialChars);
  }, [visible, players]);

  function toggle(userId: string) {
    setSelected((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  function chooseCharacter(userId: string, characterId: string) {
    setCharChoice((prev) => ({ ...prev, [userId]: characterId }));
  }

  function handleStart() {
    const userIds = players.filter((p) => selected[p.userId]).map((p) => p.userId);
    // Diff against the pin — an unchanged choice costs no write. Applies
    // to absent players too: if the DM re-pointed someone who isn't
    // playing tonight, that's still a roster change worth persisting.
    const characterPicks = players
      .map((p) => ({ userId: p.userId, characterId: charChoice[p.userId] }))
      .filter(
        (pick): pick is { userId: string; characterId: string } =>
          typeof pick.characterId === 'string' &&
          pick.characterId !== players.find((p) => p.userId === pick.userId)?.characterId,
      );
    onConfirm({ userIds, characterPicks });
  }

  const pickedCount = players.filter((p) => selected[p.userId]).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.title}>Start Session</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>
            Pick who's playing tonight. Unselected players won't see the live
            session but can read the recap later.
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingVertical: 4 }}>
            {players.length === 0 ? (
              <Text style={styles.empty}>No players in this campaign yet.</Text>
            ) : (
              players.map((p) => {
                const on = !!selected[p.userId];
                const multi = p.characters.length > 1;
                const chosenId = charChoice[p.userId] ?? null;
                const single = p.characters.length === 1 ? p.characters[0] : null;
                return (
                  <View key={p.userId} style={styles.block}>
                    <TouchableOpacity
                      style={styles.row}
                      onPress={() => toggle(p.userId)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons
                        name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={22}
                        color={on ? colors.brand : colors.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{p.displayName}</Text>
                        {single ? (
                          <Text style={styles.rowSub}>{single.name}</Text>
                        ) : p.characters.length === 0 ? (
                          <Text style={styles.rowSubMuted}>No character yet</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>

                    {/* Character picker — only earns its space when the
                        player actually has a choice to make. */}
                    {multi ? (
                      <View style={[styles.charList, !on && styles.charListDim]}>
                        <Text style={styles.charHint}>Playing as</Text>
                        {p.characters.map((c) => {
                          const active = c.id === chosenId;
                          return (
                            <TouchableOpacity
                              key={c.id}
                              style={styles.charRow}
                              onPress={() => chooseCharacter(p.userId, c.id)}
                              activeOpacity={0.7}
                            >
                              <MaterialCommunityIcons
                                name={active ? 'radiobox-marked' : 'radiobox-blank'}
                                size={18}
                                color={active ? colors.brand : colors.textSecondary}
                              />
                              <Text
                                style={[styles.charName, active && styles.charNameActive]}
                                numberOfLines={1}
                              >
                                {c.name}
                              </Text>
                              {c.subtitle ? (
                                <Text style={styles.charMeta} numberOfLines={1}>
                                  {c.subtitle}
                                </Text>
                              ) : null}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.startBtn, starting && styles.btnDisabled]}
            onPress={handleStart}
            disabled={starting}
          >
            <MaterialCommunityIcons name="play" size={16} color="#fff" />
            <Text style={styles.startBtnText}>
              {starting ? 'Starting…' : `Start Session (${pickedCount})`}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: 16, padding: spacing.lg, width: '100%', maxWidth: 460,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  subtitle: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 18,
    marginBottom: spacing.md,
  },
  list: { maxHeight: 360, marginBottom: spacing.md },
  empty: { fontSize: 13, color: colors.textSecondary, padding: spacing.md },
  block: { borderBottomColor: colors.border, borderBottomWidth: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10,
  },
  rowName: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' },
  rowSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  rowSubMuted: { fontSize: 12, color: colors.outline, marginTop: 2 },
  charList: {
    paddingLeft: 30, paddingBottom: 10, gap: 2,
  },
  charListDim: { opacity: 0.5 },
  charHint: {
    fontSize: 11, color: colors.outline, textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: 2,
  },
  charRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 5,
  },
  charName: { fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
  charNameActive: { color: colors.textPrimary, fontWeight: '600' },
  charMeta: { fontSize: 11, color: colors.outline, flexShrink: 1 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 12,
  },
  startBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
});
