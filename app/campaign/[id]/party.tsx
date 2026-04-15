import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, RefreshControl, StyleSheet,
  Animated, Modal, Pressable, Switch, TextInput, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getCampaignPartyState, updateCharacterState, updatePartyViewSettings, supabase,
} from '@vaultstone/api';
import { useAuthStore, useUiStore } from '@vaultstone/store';
import { colors, spacing } from '@vaultstone/ui';
import {
  DEFAULT_PARTY_VIEW_SETTINGS,
  type Dnd5eAbilityScores, type Dnd5eClassResource,
  type Dnd5eEquipmentItem, type Dnd5eResources, type Dnd5eStats,
  type PartyViewSettings,
} from '@vaultstone/types';
import { HpModal } from '../../../components/character-sheet/HpModal';
import { ConditionsPanel } from '../../../components/character-sheet/ConditionsPanel';
import { SpellSlotPips } from '../../../components/party/SpellSlotPips';
import { ClassResourcePips } from '../../../components/party/ClassResourcePips';

type PartyMember = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  profiles: { id: string; display_name: string | null } | null;
  characters: {
    id: string;
    name: string;
    user_id?: string;
    base_stats: unknown;
    resources: unknown;
    conditions: string[] | null;
    updated_at?: string;
  } | null;
};

const ROLE_LABEL: Record<string, string> = { gm: 'DM', co_gm: 'Co-DM', player: 'Player' };

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function computeAc(stats: Dnd5eStats, resources: Dnd5eResources): number {
  const scores = stats.abilityScores;
  const dexMod = abilityMod(scores.dexterity);
  const equipment: Dnd5eEquipmentItem[] = resources.equipment ?? [];
  const armor = equipment.find((e) => e.slot === 'armor' && e.equipped);
  const shield = equipment.find((e) => e.slot === 'shield' && e.equipped);
  let base = 10 + dexMod;
  if (armor) {
    const cap = armor.dexCap;
    const dexBonus = cap !== undefined && cap !== null ? Math.min(dexMod, cap) : dexMod;
    base = (armor.acBase ?? 10) + dexBonus;
  }
  if (shield) base += shield.acBonus ?? 2;
  return base;
}

function hpColor(current: number, max: number): string {
  if (max <= 0) return colors.textSecondary;
  if (current === 0) return colors.hpDanger;
  const ratio = current / max;
  if (ratio >= 1) return colors.hpHealthy;
  if (ratio > 0.75) return '#A3D977';
  if (ratio > 0.5) return colors.hpWarning;
  if (ratio > 0.25) return '#F97316';
  return colors.hpDanger;
}

function hpTier(current: number, max: number): string {
  if (max <= 0 || current === 0) return 'Down';
  const ratio = current / max;
  if (ratio >= 1) return 'Healthy';
  if (ratio > 0.5) return 'Wounded';
  if (ratio > 0.25) return 'Bloodied';
  return 'Critical';
}

export default function PartyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [settings, setSettings] = useState<PartyViewSettings>(DEFAULT_PARTY_VIEW_SETTINGS);
  const [dmUserId, setDmUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Record<string, number>>({});
  const flashTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isDm = !!user && !!dmUserId && user.id === dmUserId;

  const load = useCallback(async () => {
    if (!id) return;
    const [partyRes, campaignRes] = await Promise.all([
      getCampaignPartyState(id),
      supabase
        .from('campaigns')
        .select('dm_user_id, party_view_settings')
        .eq('id', id)
        .single(),
    ]);
    if (partyRes.data) setMembers(partyRes.data as unknown as PartyMember[]);
    if (campaignRes.data) {
      setDmUserId(campaignRes.data.dm_user_id);
      const raw = (campaignRes.data.party_view_settings ?? {}) as Partial<PartyViewSettings>;
      setSettings({ ...DEFAULT_PARTY_VIEW_SETTINGS, ...raw });
    }
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime: merge inbound character UPDATE payloads; mark for flash if
  // the change originated from another viewer (the patch touched a key we
  // did not just write from this tab).
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`party:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'characters' },
        (payload) => {
          const next = payload.new as {
            id: string;
            base_stats: unknown;
            resources: unknown;
            conditions: string[] | null;
            name: string;
          };
          setMembers((prev) => {
            const hit = prev.some((m) => m.character_id === next.id);
            if (!hit) return prev;
            return prev.map((m) => m.character_id === next.id && m.characters ? {
              ...m,
              characters: {
                ...m.characters,
                name: next.name,
                base_stats: next.base_stats,
                resources: next.resources,
                conditions: next.conditions,
              },
            } : m);
          });
          setRecentlyUpdated((prev) => ({ ...prev, [next.id]: Date.now() }));
          const prior = flashTimersRef.current[next.id];
          if (prior) clearTimeout(prior);
          flashTimersRef.current[next.id] = setTimeout(() => {
            setRecentlyUpdated((cur) => {
              const copy = { ...cur };
              delete copy[next.id];
              return copy;
            });
          }, 1200);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'campaigns', filter: `id=eq.${id}` },
        (payload) => {
          const next = payload.new as { party_view_settings: Partial<PartyViewSettings> | null };
          const raw = (next.party_view_settings ?? {}) as Partial<PartyViewSettings>;
          setSettings({ ...DEFAULT_PARTY_VIEW_SETTINGS, ...raw });
        },
      )
      .subscribe();

    return () => {
      Object.values(flashTimersRef.current).forEach(clearTimeout);
      flashTimersRef.current = {};
      supabase.removeChannel(channel);
    };
  }, [id]);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const dm = useMemo(() => members.find((m) => m.role === 'gm'), [members]);
  const players = useMemo(() => members.filter((m) => m.role !== 'gm'), [members]);
  const linked = useMemo(() => players.filter((m) => m.characters), [players]);

  async function handleSettingChange(key: keyof PartyViewSettings, value: boolean) {
    if (!id || !isDm) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    await updatePartyViewSettings(id, next);
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
    >
      <TouchableOpacity onPress={() => router.back()} style={s.back}>
        <MaterialCommunityIcons name="arrow-left" size={18} color={colors.brand} />
        <Text style={s.backText}>Campaign</Text>
      </TouchableOpacity>

      <View style={s.header}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Party</Text>
            {dm?.profiles?.display_name && (
              <Text style={s.subtitle}>DM · {dm.profiles.display_name}</Text>
            )}
          </View>
          {isDm && (
            <TouchableOpacity
              style={s.gearBtn}
              onPress={() => setSettingsVisible(true)}
              accessibilityLabel="Party view settings"
            >
              <MaterialCommunityIcons name="cog-outline" size={22} color={colors.brand} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading && members.length === 0 ? (
        <Text style={s.helperText}>Loading…</Text>
      ) : linked.length === 0 ? (
        <View style={s.emptyCard}>
          <MaterialCommunityIcons
            name="account-alert-outline"
            size={32}
            color={colors.textSecondary}
          />
          <Text style={s.emptyTitle}>No characters linked yet</Text>
          <Text style={s.emptyBody}>
            Players need to link a character to appear here. Open Manage Members
            to see who&apos;s joined.
          </Text>
          <TouchableOpacity
            style={s.emptyAction}
            onPress={() => router.replace(`/campaign/${id}` as never)}
          >
            <Text style={s.emptyActionText}>Go to Campaign</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.list}>
          {players.map((m) => (
            <PartyCard
              key={m.user_id}
              campaignId={id!}
              member={m}
              viewerUserId={user?.id ?? null}
              viewerIsDm={isDm}
              settings={settings}
              flashing={!!(m.characters && recentlyUpdated[m.characters.id])}
              router={router}
            />
          ))}
        </View>
      )}

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        settings={settings}
        onChange={handleSettingChange}
      />
    </ScrollView>
  );
}

function PartyCard({
  campaignId, member, viewerUserId, viewerIsDm, settings, flashing, router,
}: {
  campaignId: string;
  member: PartyMember;
  viewerUserId: string | null;
  viewerIsDm: boolean;
  settings: PartyViewSettings;
  flashing: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const char = member.characters;
  const ownerName = member.profiles?.display_name ?? 'Anonymous';
  const role = ROLE_LABEL[member.role] ?? member.role;
  const isMe = member.user_id === viewerUserId;
  const viewerIsOwner = isMe;
  const canEdit = viewerIsDm || viewerIsOwner;

  const isCollapsed = useUiStore((state) =>
    viewerIsDm ? state.isCollapsed(campaignId, member.user_id) : false,
  );
  const toggleCollapsed = useUiStore((state) => state.toggleCollapsed);

  const [hpModalOpen, setHpModalOpen] = useState(false);
  const [condModalOpen, setCondModalOpen] = useState(false);
  const [concentrationModalOpen, setConcentrationModalOpen] = useState(false);

  const flashAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!flashing) return;
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [flashing]);

  const animatedBorder = flashAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.brand],
  });

  if (!char) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialCommunityIcons
            name="account-alert-outline"
            size={22}
            color={colors.textSecondary}
          />
          <View style={{ flex: 1 }}>
            <Text style={s.charName}>No character linked</Text>
            <Text style={s.ownerLine}>
              {ownerName} · {role}{isMe ? ' (you)' : ''}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const stats = char.base_stats as Dnd5eStats | null;
  const resources = char.resources as Dnd5eResources | null;
  const conditions = char.conditions ?? [];

  const level = stats?.level ?? 1;
  const classLabel = stats?.classKey ? capitalize(stats.classKey) : null;
  const speciesLabel = stats?.speciesKey
    ? stats.speciesKey.split('-').map(capitalize).join(' ')
    : null;
  const hpMax = stats?.hpMax ?? 0;
  const hpCurrent = resources?.hpCurrent ?? hpMax;
  const hpTemp = resources?.hpTemp ?? 0;
  const ac = stats && resources ? computeAc(stats, resources) : null;
  const speed = stats?.speed ?? null;
  const exhaustionLevel = resources?.exhaustionLevel ?? 0;
  const inspiration = resources?.inspiration ?? false;
  const concentrationSpell = resources?.concentrationSpell ?? null;

  const pct = hpMax > 0 ? Math.max(0, Math.min(100, (hpCurrent / hpMax) * 100)) : 0;
  const barColor = hpColor(hpCurrent, hpMax);

  // Visibility: full detail for DM or owner; abstracted for other players.
  const showHpNumbers = canEdit || settings.showHpNumbersToPlayers;
  const showConditionDetail = canEdit || settings.showConditionsToPlayers;
  const showSlots = canEdit || settings.showSlotsToPlayers;
  const showResources = canEdit || settings.showResourcesToPlayers;

  function navigateToSheet() {
    if (viewerIsDm || viewerIsOwner) {
      router.push(`/character/${char!.id}` as never);
      return;
    }
    if (settings.allowPlayerCrossView) {
      router.push(`/character/${char!.id}` as never);
    }
  }

  async function applyHp(updated: Dnd5eResources) {
    if (!resources) return;
    await updateCharacterState(char!.id, {
      hpCurrent: updated.hpCurrent,
      hpTemp: updated.hpTemp,
    });
  }

  async function toggleCondition(condition: string) {
    const next = conditions.includes(condition)
      ? conditions.filter((c) => c !== condition)
      : [...conditions, condition];
    await updateCharacterState(char!.id, { conditions: next });
  }

  async function setExhaustion(level: number) {
    await updateCharacterState(char!.id, { exhaustionLevel: Math.max(0, Math.min(6, level)) });
  }

  async function toggleInspiration() {
    await updateCharacterState(char!.id, { inspiration: !inspiration });
  }

  async function bumpDeathSave(kind: 'success' | 'failure') {
    if (!resources?.deathSaves) return;
    const ds = resources.deathSaves;
    const next = kind === 'success'
      ? { ...ds, successes: Math.min(3, ds.successes + 1) }
      : { ...ds, failures: Math.min(3, ds.failures + 1) };
    await updateCharacterState(char!.id, { deathSaves: next });
  }

  async function applySlots(spellSlots: Dnd5eResources['spellSlots']) {
    await updateCharacterState(char!.id, { spellSlots });
  }

  async function applyClassResources(list: Dnd5eClassResource[]) {
    await updateCharacterState(char!.id, { classResources: list });
  }

  async function applyConcentration(spell: string | null) {
    await updateCharacterState(char!.id, { concentrationSpell: spell });
  }

  return (
    <Animated.View style={[s.card, flashing && { borderColor: animatedBorder }]}>
      <View style={s.cardHeader}>
        <TouchableOpacity
          onPress={navigateToSheet}
          style={s.headerTap}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="account-circle-outline" size={22} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={s.charName} numberOfLines={1}>{char.name}</Text>
            <Text style={s.subLine} numberOfLines={1}>
              {[speciesLabel, classLabel && `${classLabel} ${level}`].filter(Boolean).join(' · ') || `Level ${level}`}
            </Text>
          </View>
        </TouchableOpacity>
        {viewerIsDm && (
          <TouchableOpacity
            style={s.chevronBtn}
            onPress={() => toggleCollapsed(campaignId, member.user_id)}
            accessibilityLabel={isCollapsed ? 'Expand card' : 'Collapse card'}
          >
            <MaterialCommunityIcons
              name={isCollapsed ? 'chevron-down' : 'chevron-up'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      {!isCollapsed && (
        <>
          <TouchableOpacity
            activeOpacity={canEdit ? 0.6 : 1}
            disabled={!canEdit}
            onPress={() => canEdit && resources && setHpModalOpen(true)}
          >
            <View style={s.hpRow}>
              {showHpNumbers ? (
                <Text style={s.hpNumbers}>
                  <Text style={[s.hpCurrent, { color: barColor }]}>{hpCurrent}</Text>
                  <Text style={s.hpMax}> / {hpMax}</Text>
                  {hpTemp > 0 ? <Text style={s.hpTemp}>  (+{hpTemp} temp)</Text> : null}
                </Text>
              ) : (
                <Text style={[s.hpCurrent, { color: barColor, fontSize: 16 }]}>
                  {hpTier(hpCurrent, hpMax)}
                </Text>
              )}
              <Text style={s.hpLabel}>HP{canEdit ? ' ✎' : ''}</Text>
            </View>
            <View style={s.hpBarTrack}>
              <View style={[s.hpBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
            </View>
          </TouchableOpacity>

          <View style={s.statsRow}>
            {ac !== null && <StatPill label="AC" value={ac} />}
            {speed !== null && <StatPill label="Speed" value={`${speed}`} />}
            {stats?.hitDie ? <StatPill label="Hit Die" value={`d${stats.hitDie}`} /> : null}
            <TouchableOpacity
              disabled={!canEdit}
              onPress={toggleInspiration}
              style={[s.statPill, inspiration && s.inspirationActive]}
            >
              <MaterialCommunityIcons
                name={inspiration ? 'star' : 'star-outline'}
                size={14}
                color={inspiration ? colors.hpWarning : colors.textSecondary}
              />
              <Text style={[s.statPillValue, inspiration && { color: colors.hpWarning }]}>
                Insp
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={canEdit ? 0.6 : 1}
            disabled={!canEdit}
            onPress={() => canEdit && setCondModalOpen(true)}
          >
            {showConditionDetail ? (
              (conditions.length > 0 || exhaustionLevel > 0 || canEdit) && (
                <View style={s.conditionsRow}>
                  {conditions.map((c) => (
                    <View key={c} style={s.conditionChip}>
                      <Text style={s.conditionChipText}>{c}</Text>
                    </View>
                  ))}
                  {exhaustionLevel > 0 && (
                    <View style={[s.conditionChip, s.exhaustionChip]}>
                      <Text style={[s.conditionChipText, s.exhaustionChipText]}>
                        Exhaustion {exhaustionLevel}
                      </Text>
                    </View>
                  )}
                  {canEdit && conditions.length === 0 && exhaustionLevel === 0 && (
                    <Text style={s.hint}>Tap to add condition</Text>
                  )}
                </View>
              )
            ) : (
              (conditions.length > 0 || exhaustionLevel > 0) && (
                <View style={s.conditionsRow}>
                  <View style={s.conditionChip}>
                    <Text style={s.conditionChipText}>
                      {conditions.length + (exhaustionLevel > 0 ? 1 : 0)} condition{conditions.length + (exhaustionLevel > 0 ? 1 : 0) === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
              )
            )}
          </TouchableOpacity>

          {concentrationSpell && (
            <TouchableOpacity
              disabled={!canEdit}
              onPress={() => setConcentrationModalOpen(true)}
              style={s.concentrationChip}
            >
              <MaterialCommunityIcons name="meditation" size={14} color={colors.brand} />
              <Text style={s.concentrationText} numberOfLines={1}>
                Concentrating: {concentrationSpell}
              </Text>
            </TouchableOpacity>
          )}
          {!concentrationSpell && canEdit && (
            <TouchableOpacity
              onPress={() => setConcentrationModalOpen(true)}
              style={s.concentrationAddBtn}
            >
              <MaterialCommunityIcons name="meditation" size={14} color={colors.textSecondary} />
              <Text style={s.concentrationAddText}>Set concentration</Text>
            </TouchableOpacity>
          )}

          {hpCurrent === 0 && resources?.deathSaves && (
            <View style={s.deathRow}>
              <View style={s.deathSide}>
                <Text style={s.deathLabel}>Saves</Text>
                <View style={s.deathPips}>
                  {[0, 1, 2].map((i) => (
                    <TouchableOpacity
                      key={`s${i}`}
                      disabled={!canEdit}
                      onPress={() => bumpDeathSave('success')}
                      style={[
                        s.deathPip,
                        i < resources.deathSaves.successes && s.deathPipSuccess,
                      ]}
                    />
                  ))}
                </View>
              </View>
              <View style={s.deathSide}>
                <Text style={s.deathLabel}>Failures</Text>
                <View style={s.deathPips}>
                  {[0, 1, 2].map((i) => (
                    <TouchableOpacity
                      key={`f${i}`}
                      disabled={!canEdit}
                      onPress={() => bumpDeathSave('failure')}
                      style={[
                        s.deathPip,
                        i < resources.deathSaves.failures && s.deathPipFailure,
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>
          )}

          {showSlots && resources?.spellSlots && (
            <SpellSlotPips
              spellSlots={resources.spellSlots}
              canEdit={canEdit}
              onChange={applySlots}
            />
          )}

          {showResources && resources?.classResources && resources.classResources.length > 0 && (
            <ClassResourcePips
              resources={resources.classResources}
              canEdit={canEdit}
              onChange={applyClassResources}
            />
          )}

          <Text style={s.ownerLine}>
            {ownerName} · {role}{isMe ? ' (you)' : ''}
          </Text>
        </>
      )}

      {resources && (
        <HpModal
          visible={hpModalOpen}
          resources={resources}
          hpMax={hpMax}
          onClose={() => setHpModalOpen(false)}
          onApply={applyHp}
        />
      )}

      <ConditionsModal
        visible={condModalOpen}
        onClose={() => setCondModalOpen(false)}
        characterName={char.name}
        conditions={conditions}
        exhaustionLevel={exhaustionLevel}
        onToggle={toggleCondition}
        onSetExhaustion={setExhaustion}
      />

      <ConcentrationModal
        visible={concentrationModalOpen}
        onClose={() => setConcentrationModalOpen(false)}
        currentSpell={concentrationSpell}
        onApply={applyConcentration}
      />
    </Animated.View>
  );
}

function ConditionsModal({
  visible, onClose, characterName, conditions, exhaustionLevel, onToggle, onSetExhaustion,
}: {
  visible: boolean;
  onClose: () => void;
  characterName: string;
  conditions: string[];
  exhaustionLevel: number;
  onToggle: (c: string) => void;
  onSetExhaustion: (n: number) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet}>
          <Text style={s.sheetTitle}>{characterName} — Conditions</Text>
          <ConditionsPanel
            conditions={conditions}
            exhaustionLevel={exhaustionLevel}
            onToggle={onToggle}
            onSetExhaustion={onSetExhaustion}
          />
          <TouchableOpacity onPress={onClose} style={s.sheetClose}>
            <Text style={s.sheetCloseText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ConcentrationModal({
  visible, onClose, currentSpell, onApply,
}: {
  visible: boolean;
  onClose: () => void;
  currentSpell: string | null;
  onApply: (spell: string | null) => void;
}) {
  const [input, setInput] = useState(currentSpell ?? '');

  useEffect(() => {
    if (visible) setInput(currentSpell ?? '');
  }, [visible, currentSpell]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet}>
          <Text style={s.sheetTitle}>Concentration</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Spell name (e.g. Bless)"
            placeholderTextColor={colors.textSecondary}
            style={s.input}
            autoFocus
          />
          <View style={s.buttonRow}>
            <TouchableOpacity
              style={[s.btn, s.btnSecondary]}
              onPress={() => { onApply(null); onClose(); }}
            >
              <Text style={s.btnSecondaryText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary]}
              disabled={!input.trim()}
              onPress={() => { onApply(input.trim() || null); onClose(); }}
            >
              <Text style={s.btnPrimaryText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SettingsModal({
  visible, onClose, settings, onChange,
}: {
  visible: boolean;
  onClose: () => void;
  settings: PartyViewSettings;
  onChange: (key: keyof PartyViewSettings, value: boolean) => void;
}) {
  const rows: { key: keyof PartyViewSettings; label: string; help: string }[] = [
    { key: 'showHpNumbersToPlayers', label: 'Show HP numbers to players', help: 'When off, other players see Healthy/Wounded/Bloodied/Critical.' },
    { key: 'showConditionsToPlayers', label: 'Show conditions to players', help: 'When off, other players see only a count.' },
    { key: 'showSlotsToPlayers', label: 'Show spell slots to players', help: 'Pips are hidden from other players.' },
    { key: 'showResourcesToPlayers', label: 'Show class resources to players', help: 'Rages, ki, etc.' },
    { key: 'allowPlayerCrossView', label: 'Allow players to open other sheets', help: 'When off, tapping another player\u2019s card does nothing.' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={[s.sheet, { maxHeight: '90%' }]}>
          <Text style={s.sheetTitle}>Party View Settings</Text>
          <ScrollView style={{ maxHeight: 440 }}>
            {rows.map((row) => (
              <View key={row.key} style={s.settingRow}>
                <View style={{ flex: 1, paddingRight: spacing.sm }}>
                  <Text style={s.settingLabel}>{row.label}</Text>
                  <Text style={s.settingHelp}>{row.help}</Text>
                </View>
                <Switch
                  value={settings[row.key]}
                  onValueChange={(v) => onChange(row.key, v)}
                  trackColor={{ true: colors.brand, false: colors.border }}
                  thumbColor={Platform.OS === 'android' ? colors.textPrimary : undefined}
                />
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={s.sheetClose}>
            <Text style={s.sheetCloseText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.statPill}>
      <Text style={s.statPillLabel}>{label}</Text>
      <Text style={s.statPillValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { paddingBottom: 48 },
  back: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  backText: { color: colors.brand, fontSize: 14 },
  header: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  gearBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  helperText: {
    fontSize: 13, color: colors.textSecondary, paddingHorizontal: spacing.lg,
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    padding: spacing.md, gap: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chevronBtn: { padding: 4 },
  charName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  subLine: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  hpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 },
  hpNumbers: { fontSize: 16 },
  hpCurrent: { fontSize: 20, fontWeight: '700' },
  hpMax: { fontSize: 14, color: colors.textSecondary },
  hpTemp: { fontSize: 12, color: colors.hpHealthy, fontWeight: '600' },
  hpLabel: {
    fontSize: 10, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  hpBarTrack: {
    height: 6, borderRadius: 3, backgroundColor: colors.background, overflow: 'hidden',
  },
  hpBarFill: { height: '100%', borderRadius: 3 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.background,
    borderColor: colors.border, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  statPillLabel: {
    fontSize: 10, color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  statPillValue: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  inspirationActive: {
    borderColor: colors.hpWarning,
    backgroundColor: colors.hpWarning + '22',
  },

  conditionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2, minHeight: 20 },
  conditionChip: {
    backgroundColor: colors.hpDanger + '22',
    borderColor: colors.hpDanger, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  conditionChipText: { fontSize: 11, color: colors.hpDanger, fontWeight: '700' },
  exhaustionChip: {
    backgroundColor: colors.hpWarning + '22', borderColor: colors.hpWarning,
  },
  exhaustionChipText: { color: colors.hpWarning },
  hint: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' },

  concentrationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand + '22',
    borderColor: colors.brand, borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start',
  },
  concentrationText: { fontSize: 12, color: colors.brand, fontWeight: '600' },
  concentrationAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start',
  },
  concentrationAddText: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' },

  deathRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.sm, marginTop: spacing.sm / 2,
  },
  deathSide: { alignItems: 'center', gap: 4 },
  deathLabel: { fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 },
  deathPips: { flexDirection: 'row', gap: 6 },
  deathPip: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  deathPipSuccess: { backgroundColor: colors.hpHealthy, borderColor: colors.hpHealthy },
  deathPipFailure: { backgroundColor: colors.hpDanger, borderColor: colors.hpDanger },

  ownerLine: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },

  emptyCard: {
    marginHorizontal: spacing.lg, padding: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 14,
    alignItems: 'center', gap: spacing.sm,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  emptyBody: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18,
  },
  emptyAction: {
    marginTop: spacing.sm,
    borderColor: colors.border, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  emptyActionText: { color: colors.brand, fontSize: 13, fontWeight: '600' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.border, borderWidth: 1, borderRadius: 16,
    padding: spacing.lg, width: '100%', maxWidth: 420,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', marginBottom: spacing.md,
  },
  sheetClose: {
    marginTop: spacing.md,
    alignItems: 'center',
    borderRadius: 10, paddingVertical: 12,
    backgroundColor: colors.brand,
  },
  sheetCloseText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 16, color: colors.textPrimary, backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background,
  },
  btnSecondaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: 14 },

  settingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  settingLabel: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  settingHelp: { fontSize: 11, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
});
