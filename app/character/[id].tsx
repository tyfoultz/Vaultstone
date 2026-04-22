import { useEffect, useRef, useState } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import {
  View, Text, Image, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Pressable, Switch, StyleSheet, Platform, useWindowDimensions,
} from 'react-native';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCharacterById, updateCharacter, updateCharacterState, uploadCharacterPortrait, supabase } from '@vaultstone/api';
import { useAuthStore, useCharacterStore } from '@vaultstone/store';
import { colors, spacing, fonts, radius } from '@vaultstone/ui';
import type { Database, Dnd5eStats, Dnd5eResources, Dnd5eAbilityScores, CharacterSettings, Dnd5eEquipmentItem, EquipmentSlot, Dnd5eFeature } from '@vaultstone/types';
import { HpModal } from '../../components/character-sheet/HpModal';
import { ConditionsPanel } from '../../components/character-sheet/ConditionsPanel';
import { RollToast } from '../../components/character-sheet/RollToast';
import type { RollResult } from '../../components/character-sheet/RollToast';
import { CombatTab, ConditionsSection } from '../../components/character-sheet/CombatTab';
import { SkillsTab } from '../../components/character-sheet/SkillsTab';
import { AbilitiesTab } from '../../components/character-sheet/AbilitiesTab';
import { SpellsTab } from '../../components/character-sheet/SpellsTab';
import { GearTab } from '../../components/character-sheet/GearTab';
import { LoreTab } from '../../components/character-sheet/LoreTab';

type Character = Database['public']['Tables']['characters']['Row'];

type TabId = 'combat' | 'spells' | 'skills' | 'traits' | 'gear' | 'lore';
type TabLayoutState = {
  left: TabId[];
  right: TabId[];
  activeLeft: TabId;
  activeRight: TabId | null;
};
const DEFAULT_TAB_LAYOUT: TabLayoutState = {
  left: ['combat', 'spells', 'gear'],
  right: ['skills', 'traits', 'lore'],
  activeLeft: 'combat',
  activeRight: 'skills',
};

type ActivityEntry = { id: string; at: number } & (
  | { kind: 'roll'; result: RollResult }
  | { kind: 'hp'; from: number; to: number; delta: number }
  | { kind: 'tempHp'; from: number; to: number; delta: number }
  | { kind: 'condition'; name: string; action: 'added' | 'removed' }
  | { kind: 'exhaustion'; from: number; to: number }
  | { kind: 'deathSave'; result: 'success' | 'failure' }
);
type ActivityInput = ActivityEntry extends infer U
  ? U extends { id: string; at: number }
    ? Omit<U, 'id' | 'at'>
    : never
  : never;

// ─── Helpers ────────────────────────────────────────────────────────────────

function abilityMod(score: number) { return Math.floor((score - 10) / 2); }
function profBonus(level: number) { return Math.floor((level - 1) / 4) + 2; }
function fmtMod(n: number) { return n >= 0 ? `+${n}` : `${n}`; }
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function titleCase(s: string) { return s.split(' ').map(capitalize).join(' '); }

function StatCell({ icon, value, label, color, centered }: { icon: string; value: string; label: string; color: string; centered?: boolean }) {
  return (
    <View style={[statCellStyle.cell, centered && statCellStyle.cellCentered]}>
      <MaterialCommunityIcons name={icon as any} size={16} color={color} style={{ opacity: 0.75 }} />
      <View style={statCellStyle.text}>
        <Text style={[statCellStyle.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
        <Text style={statCellStyle.label}>{label}</Text>
      </View>
    </View>
  );
}
const statCellStyle = StyleSheet.create({
  cell: {
    flex: 1,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 8,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  cellCentered: { justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 1 },
  value: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '800', lineHeight: 17 },
  label: { fontSize: 8, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.outline },
});

const SKILL_ABILITY: Record<string, keyof Dnd5eAbilityScores> = {
  acrobatics: 'dexterity', 'animal handling': 'wisdom', arcana: 'intelligence',
  athletics: 'strength', deception: 'charisma', history: 'intelligence',
  insight: 'wisdom', intimidation: 'charisma', investigation: 'intelligence',
  medicine: 'wisdom', nature: 'intelligence', perception: 'wisdom',
  performance: 'charisma', persuasion: 'charisma', religion: 'intelligence',
  'sleight of hand': 'dexterity', stealth: 'dexterity', survival: 'wisdom',
};
const ALL_SKILLS = Object.keys(SKILL_ABILITY);

const ABILITY_KEYS: (keyof Dnd5eAbilityScores)[] = [
  'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
];
const ABILITY_SHORT: Record<keyof Dnd5eAbilityScores, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

type CardId = 'combat' | 'weapons-equipment' | 'class-features' | 'species-traits' | 'feats' | 'proficiencies' | 'conditions' | 'coins' | 'scratchpad';
type CardItem = { id: CardId };

const DEFAULT_CARD_ORDER: CardId[] = [
  'combat', 'weapons-equipment', 'class-features', 'species-traits',
  'feats', 'proficiencies', 'conditions', 'coins', 'scratchpad',
];

const CARD_LABELS: Record<CardId, string> = {
  'combat': 'HP / Movement / Ability Scores / Skills',
  'weapons-equipment': 'Weapons & Equipment',
  'class-features': 'Class Features',
  'species-traits': 'Species Traits',
  'feats': 'Feats',
  'proficiencies': 'Proficiencies & Training',
  'conditions': 'Conditions',
  'coins': 'Coins',
  'scratchpad': 'Scratchpad',
};

type EntryDescriptor = { icon: string; label: string; detail: string; accent: string; total: string };

function describeEntry(e: ActivityEntry): EntryDescriptor {
  switch (e.kind) {
    case 'roll': {
      const { label, rolls, bonus, total, crit, fumble } = e.result;
      const rollStr = `[${rolls.join(', ')}]${bonus !== 0 ? (bonus > 0 ? ` + ${bonus}` : ` − ${Math.abs(bonus)}`) : ''}`;
      return {
        icon: 'dice-d20',
        label,
        detail: `${rollStr}${crit ? ' · CRIT' : fumble ? ' · FUMBLE' : ''}`,
        accent: crit ? colors.hpHealthy : fumble ? colors.hpDanger : colors.primary,
        total: String(total),
      };
    }
    case 'hp': {
      const healed = e.delta > 0;
      return {
        icon: healed ? 'heart-plus' : 'sword',
        label: healed ? 'Healed' : 'Damage',
        detail: `${e.from} → ${e.to}`,
        accent: healed ? colors.hpHealthy : colors.hpDanger,
        total: `${healed ? '+' : ''}${e.delta}`,
      };
    }
    case 'tempHp': {
      return {
        icon: 'shield-plus-outline',
        label: 'Temp HP',
        detail: `${e.from} → ${e.to}`,
        accent: '#3B82F6',
        total: `${e.delta > 0 ? '+' : ''}${e.delta}`,
      };
    }
    case 'condition': {
      const added = e.action === 'added';
      return {
        icon: added ? 'alert-circle-outline' : 'close-circle-outline',
        label: added ? `+ ${e.name}` : `− ${e.name}`,
        detail: added ? 'Condition applied' : 'Condition cleared',
        accent: added ? colors.hpDanger : colors.outline,
        total: '',
      };
    }
    case 'exhaustion': {
      return {
        icon: 'battery-low',
        label: 'Exhaustion',
        detail: `Lv ${e.from} → ${e.to}`,
        accent: colors.hpDanger,
        total: `${e.to > e.from ? '+' : ''}${e.to - e.from}`,
      };
    }
    case 'deathSave': {
      const success = e.result === 'success';
      return {
        icon: success ? 'shield-check-outline' : 'skull-outline',
        label: `Death ${success ? 'Success' : 'Failure'}`,
        detail: '',
        accent: success ? colors.hpHealthy : colors.hpDanger,
        total: '',
      };
    }
  }
}

// ─── TabPane (desktop two-column support) ──────────────────────────────────

const ALL_TAB_DEFS: { id: TabId; icon: any; label: string }[] = [
  { id: 'combat',  icon: 'sword-cross',             label: 'Combat' },
  { id: 'spells',  icon: 'auto-fix',                label: 'Spells' },
  { id: 'skills',  icon: 'star-outline',            label: 'Skills' },
  { id: 'traits',  icon: 'lightning-bolt-outline',  label: 'Traits' },
  { id: 'gear',    icon: 'bag-personal-outline',    label: 'Gear' },
  { id: 'lore',    icon: 'book-open-outline',       label: 'Lore' },
];
const TAB_ORDER: Record<TabId, number> = Object.fromEntries(
  ALL_TAB_DEFS.map((d, i) => [d.id, i])
) as Record<TabId, number>;
function sortTabs(tabs: TabId[]): TabId[] {
  return [...tabs].sort((a, b) => TAB_ORDER[a] - TAB_ORDER[b]);
}

const DND_TAB = 'char-tab';
type TabDragItem = { id: TabId; fromSide: 'left' | 'right' };

function TabPane({
  tabs, activeId, side, onActivate, onMoveToSide, renderTab,
}: {
  tabs: TabId[];
  activeId: TabId;
  side: 'left' | 'right';
  onActivate: (id: TabId) => void;
  onMoveToSide: (id: TabId, toSide: 'left' | 'right') => void;
  renderTab: (id: TabId) => React.ReactNode;
}) {
  const [{ isOver, canDrop }, dropRef] = useDrop<TabDragItem, void, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: DND_TAB,
    canDrop: (item) => item.fromSide !== side,
    drop: (item) => { onMoveToSide(item.id, side); },
    collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  }), [side, onMoveToSide]);

  return (
    <View style={paneStyle.pane}>
      <View
        ref={dropRef as any}
        style={[
          paneStyle.tabBar,
          canDrop && paneStyle.tabBarDroppable,
          canDrop && isOver && paneStyle.tabBarDropHot,
        ]}
      >
        {tabs.map((id) => {
          const def = ALL_TAB_DEFS.find((d) => d.id === id)!;
          return (
            <DraggableTab
              key={id}
              id={id}
              side={side}
              icon={def.icon}
              label={def.label}
              active={id === activeId}
              onPress={() => onActivate(id)}
            />
          );
        })}
        {canDrop && tabs.length === 0 && (
          <Text style={paneStyle.tabBarHint}>Drop tab here</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>{renderTab(activeId)}</View>
    </View>
  );
}

function DraggableTab({
  id, side, icon, label, active, onPress,
}: {
  id: TabId;
  side: 'left' | 'right';
  icon: any;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const [{ isDragging }, dragRef] = useDrag<TabDragItem, void, { isDragging: boolean }>(() => ({
    type: DND_TAB,
    item: { id, fromSide: side },
    collect: (m) => ({ isDragging: m.isDragging() }),
  }), [id, side]);
  return (
    <View ref={dragRef as any} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <TouchableOpacity
        style={[paneStyle.tabBtn, active && paneStyle.tabBtnActive]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name={icon} size={16} color={active ? colors.primary : colors.outline} />
        <Text style={[paneStyle.tabLabel, active && paneStyle.tabLabelActive]}>{label}</Text>
      </TouchableOpacity>
    </View>
  );
}

function SplitDropZone({ onMove }: { onMove: (id: TabId) => void }) {
  const [{ isOver, canDrop }, dropRef] = useDrop<TabDragItem, void, { isOver: boolean; canDrop: boolean }>(() => ({
    accept: DND_TAB,
    canDrop: (item) => item.fromSide === 'left',
    drop: (item) => onMove(item.id),
    collect: (m) => ({ isOver: m.isOver(), canDrop: m.canDrop() }),
  }), [onMove]);
  if (!canDrop) return null;
  return (
    <View ref={dropRef as any} style={[paneStyle.splitZone, isOver && paneStyle.splitZoneHot]}>
      <Text style={paneStyle.splitZoneLabel}>Drop here to split</Text>
    </View>
  );
}

const paneStyle = StyleSheet.create({
  pane: { flex: 1, flexDirection: 'column' },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    paddingHorizontal: 6, paddingTop: 6, gap: 2,
    flexWrap: 'wrap',
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 6, borderWidth: 1, borderColor: 'transparent',
    backgroundColor: colors.surfaceContainerLowest,
  },
  tabBtnActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
  tabLabel: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  tabLabelActive: { color: colors.primary },
  tabBarDroppable: { backgroundColor: `${colors.primary}08` },
  tabBarDropHot: { backgroundColor: `${colors.primary}22` },
  tabBarHint: {
    fontSize: 11, fontFamily: fonts.label, color: colors.outline, fontStyle: 'italic',
    paddingVertical: 8, paddingHorizontal: 10, alignSelf: 'center',
  },
  splitZone: {
    width: 120, alignItems: 'center', justifyContent: 'center',
    backgroundColor: `${colors.primary}0a`,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.outlineVariant,
    borderStyle: 'dashed', borderRightWidth: 2, borderRightColor: `${colors.primary}55`,
  },
  splitZoneHot: { backgroundColor: `${colors.primary}22` },
  splitZoneLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.primary, textAlign: 'center', paddingHorizontal: 8,
  },
});

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function CharacterSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { updateCharacterLocally } = useCharacterStore();
  const authUser = useAuthStore((state) => state.user);

  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hpModalVisible, setHpModalVisible] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldInput, setFieldInput] = useState('');
  const [hpQuickMode, setHpQuickMode] = useState<'damage' | 'heal' | null>(null);
  const [equipModal, setEquipModal] = useState(false);
  const [editEquip, setEditEquip] = useState<Dnd5eEquipmentItem | null>(null);
  const [xpAddMode, setXpAddMode] = useState(false);
  const [xpAddInput, setXpAddInput] = useState('');
  const [featureModal, setFeatureModal] = useState(false);
  const [editFeature, setEditFeature] = useState<Dnd5eFeature | null>(null);
  const [featureCategory, setFeatureCategory] = useState<'classFeatures' | 'speciesTraits' | 'feats'>('classFeatures');
  const [tempHpFieldInput, setTempHpFieldInput] = useState('');
  const [hpQuickInput, setHpQuickInput] = useState('');
  const [scratchpad, setScratchpad] = useState('');
  const [isDmOfLinkedCampaign, setIsDmOfLinkedCampaign] = useState(false);
  const [portraitUploading, setPortraitUploading] = useState(false);
  const [editLayout, setEditLayout] = useState(false);
  const [cardItems, setCardItems] = useState<CardItem[]>(DEFAULT_CARD_ORDER.map((id) => ({ id })));
  const [activeTab, setActiveTab] = useState<TabId>('combat');
  const [tabLayout, setTabLayout] = useState<TabLayoutState>(DEFAULT_TAB_LAYOUT);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
  const [rollResult, setRollResult] = useState<RollResult | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [logModal, setLogModal] = useState(false);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    getCharacterById(id).then(({ data, error: err }) => {
      if (err) setError('Failed to load character.');
      else {
        setCharacter(data);
        const res = data?.resources as Dnd5eResources | null;
        if (res?.notes) setScratchpad(res.notes);
        const st = data?.base_stats as Dnd5eStats | null;
        if (st?.settings?.cardOrder) {
          setCardItems(st.settings.cardOrder.map((id) => ({ id: id as CardId })));
        }
        if (st?.settings?.tabLayout) {
          setTabLayout(st.settings.tabLayout as TabLayoutState);
        }
      }
      setLoading(false);
    });
  }, [id]);

  // Is the viewer the DM of any campaign this character is linked to?
  // Drives edit-permission on the sheet — the DM gets write access to the
  // RPC-whitelisted session-state fields (HP, conditions, slots, etc.)
  // while non-owner / non-DM viewers stay read-only.
  useEffect(() => {
    if (!id || !authUser?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('campaign_members')
        .select('campaigns!inner(dm_user_id)')
        .eq('character_id', id);
      if (cancelled) return;
      const isDm = (data ?? []).some(
        (row) => (row as { campaigns?: { dm_user_id?: string } }).campaigns?.dm_user_id === authUser.id,
      );
      setIsDmOfLinkedCampaign(isDm);
    })();
    return () => { cancelled = true; };
  }, [id, authUser?.id]);

  // Realtime: when another viewer (e.g. the DM via Party View) mutates this
  // character, merge the payload into local state so the sheet reflects the
  // change without a refresh. We intentionally don't sync the scratchpad
  // field — it has in-progress notes that would clobber local edits.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`character:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const next = payload.new as Character;
          setCharacter(next);
          updateCharacterLocally(id, {
            base_stats: next.base_stats,
            resources: next.resources,
            conditions: next.conditions,
            name: next.name,
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const stats = character?.base_stats as Dnd5eStats | null;
  const resources = character?.resources as Dnd5eResources | null;
  const settings: CharacterSettings = stats?.settings ?? { manualMode: false };
  const manualMode = settings.manualMode;
  const prof = stats ? profBonus(stats.level) : 2;
  const scores = stats?.abilityScores;

  function skillMod(skillName: string): number {
    if (!scores || !stats) return 0;
    const base = abilityMod(scores[SKILL_ABILITY[skillName]]);
    return base + (stats.skillProficiencies.includes(skillName) ? prof : 0);
  }

  function saveMod(ability: keyof Dnd5eAbilityScores): number {
    if (!scores || !stats) return 0;
    const base = abilityMod(scores[ability]);
    return base + (stats.savingThrowProficiencies.includes(ability) ? prof : 0);
  }

  const equipment: Dnd5eEquipmentItem[] = resources?.equipment ?? [];
  const ac = scores ? getEquippedAC() : 10;
  const initiative = scores ? abilityMod(scores.dexterity) : 0;
  const passivePerception = 10 + skillMod('perception');

  function hpColor(): string {
    if (!resources || !stats) return colors.textPrimary;
    if (resources.hpCurrent === 0) return colors.hpDanger;
    const ratio = resources.hpCurrent / stats.hpMax;
    if (ratio >= 1) return colors.hpHealthy;       // 100% — green
    if (ratio > 0.75) return '#A3D977';             // 75-99% — yellow-green
    if (ratio > 0.5) return colors.hpWarning;       // 50-75% — yellow
    if (ratio > 0.25) return '#F97316';             // 25-50% — orange
    return colors.hpDanger;                          // <25% — red
  }

  // ── Persist ─────────────────────────────────────────────────────────────

  // Ownership + authorization for this sheet:
  // - Owner: full edit access (direct table update).
  // - DM of a linked campaign: may edit session-state fields (the RPC
  //   whitelist) but not durable sheet fields (name, stats, equipment).
  // - Anyone else (cross-view guest): read-only.
  const isOwner = !!character && !!authUser && character.user_id === authUser.id;
  const canEditAny = isOwner || isDmOfLinkedCampaign;
  const isReadOnly = !canEditAny;

  // Keys inside resources that the RPC's whitelist accepts. Anything not in
  // this set is owner-only — the DM sheet silently skips writes for them.
  const RPC_RESOURCE_KEYS: (keyof Dnd5eResources)[] = [
    'hpCurrent', 'hpTemp', 'exhaustionLevel', 'spellSlots',
    'classResources', 'deathSaves', 'inspiration', 'concentrationSpell',
  ];

  async function persistResources(updated: Dnd5eResources) {
    if (!character || !canEditAny) return;
    const prev = (character.resources ?? {}) as unknown as Dnd5eResources;
    if (prev.hpCurrent !== undefined && prev.hpCurrent !== updated.hpCurrent) {
      logActivity({ kind: 'hp', from: prev.hpCurrent, to: updated.hpCurrent, delta: updated.hpCurrent - prev.hpCurrent });
    }
    if (prev.hpTemp !== undefined && prev.hpTemp !== updated.hpTemp) {
      logActivity({ kind: 'tempHp', from: prev.hpTemp, to: updated.hpTemp, delta: updated.hpTemp - prev.hpTemp });
    }
    const res = updated as unknown as import('@vaultstone/types').Json;
    setCharacter({ ...character, resources: res });
    updateCharacterLocally(character.id, { resources: res });

    if (isOwner) {
      await updateCharacter(character.id, { resources: res });
      return;
    }

    // DM path: send only whitelisted resource-key diffs via the RPC. Any
    // non-whitelisted changes (equipment, coins, features, notes, …) are
    // silently dropped — the sheet controls for those are disabled anyway.
    const current = (character.resources ?? {}) as unknown as Dnd5eResources;
    const patch: Record<string, unknown> = {};
    for (const key of RPC_RESOURCE_KEYS) {
      if (JSON.stringify(updated[key]) !== JSON.stringify(current[key])) {
        patch[key] = updated[key];
      }
    }
    if (Object.keys(patch).length > 0) {
      await updateCharacterState(character.id, patch);
    }
  }

  async function handleDragEnd(newItems: CardItem[]) {
    setCardItems(newItems);
    const order = newItems.map((i) => i.id);
    const newSettings: CharacterSettings = { ...stats.settings, manualMode: stats.settings?.manualMode ?? false, cardOrder: order };
    persistStats({ ...stats, settings: newSettings });
  }

  async function handlePickPortrait() {
    if (!character) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPortraitUploading(true);
    const { url } = await uploadCharacterPortrait(character.id, asset.uri, asset.mimeType ?? 'image/jpeg');
    setPortraitUploading(false);
    if (url) {
      const updated = { ...character, avatar_url: url };
      setCharacter(updated);
      updateCharacterLocally(character.id, { avatar_url: url });
    }
  }

  async function persistConditions(newConditions: string[]) {
    if (!character || !canEditAny) return;
    setCharacter({ ...character, conditions: newConditions });
    updateCharacterLocally(character.id, { conditions: newConditions });
    if (isOwner) {
      await updateCharacter(character.id, { conditions: newConditions });
    } else {
      await updateCharacterState(character.id, { conditions: newConditions });
    }
  }

  async function persistStats(updated: Dnd5eStats) {
    if (!character || !isOwner) return;
    const bs = updated as unknown as import('@vaultstone/types').Json;
    setCharacter({ ...character, base_stats: bs });
    updateCharacterLocally(character.id, { base_stats: bs });
    await updateCharacter(character.id, { base_stats: bs });
  }

  function persistTabLayout(next: TabLayoutState) {
    setTabLayout(next);
    if (stats && isOwner) {
      const currentSettings = stats.settings ?? { manualMode: false };
      persistStats({ ...stats, settings: { ...currentSettings, tabLayout: next } });
    }
  }

  function moveTab(tabId: TabId, toSide: 'left' | 'right') {
    const current = tabLayout;
    const fromSide: 'left' | 'right' = current.left.includes(tabId) ? 'left' : 'right';
    if (fromSide === toSide) return;
    const fromList = current[fromSide].filter((t) => t !== tabId);
    const toList = sortTabs([...current[toSide], tabId]);
    const originActive: 'activeLeft' | 'activeRight' = fromSide === 'left' ? 'activeLeft' : 'activeRight';
    const targetActive: 'activeLeft' | 'activeRight' = toSide === 'left' ? 'activeLeft' : 'activeRight';
    const next: TabLayoutState = {
      ...current,
      [fromSide]: sortTabs(fromList),
      [toSide]: toList,
    } as TabLayoutState;
    next[targetActive] = tabId;
    if (current[originActive] === tabId) {
      next[originActive] = (sortTabs(fromList)[0] ?? null) as any;
    }
    persistTabLayout(next);
  }

  function setSideActive(side: 'left' | 'right', tabId: TabId) {
    persistTabLayout({
      ...tabLayout,
      [side === 'left' ? 'activeLeft' : 'activeRight']: tabId,
    });
  }

  async function persistName(newName: string) {
    if (!character || !isOwner) return;
    setCharacter({ ...character, name: newName });
    updateCharacterLocally(character.id, { name: newName });
    await updateCharacter(character.id, { name: newName });
    if (stats) {
      persistStats({ ...stats, characterName: newName });
    }
  }

  function handleToggleManualMode() {
    if (!stats) return;
    persistStats({ ...stats, settings: { ...settings, manualMode: !manualMode } });
  }

  function startEditField(field: string, currentValue: string | number) {
    setEditingField(field);
    setFieldInput(String(currentValue));
  }

  function saveEditField() {
    if (!stats || !scores || !editingField) return;
    const val = fieldInput.trim();
    if (!val) { setEditingField(null); return; }

    const num = parseInt(val, 10);

    if (ABILITY_KEYS.includes(editingField as any)) {
      if (isNaN(num) || num < 1 || num > 30) { setEditingField(null); return; }
      persistStats({
        ...stats,
        abilityScores: { ...scores, [editingField]: num },
        // Recalc HP max if CON changed
        ...(editingField === 'constitution'
          ? { hpMax: stats.hitDie + abilityMod(num) + (stats.level - 1) * (Math.floor(stats.hitDie / 2) + 1 + abilityMod(num)) }
          : {}),
      });
    } else if (editingField === 'level') {
      if (isNaN(num) || num < 1 || num > 20) { setEditingField(null); return; }
      persistStats({ ...stats, level: num });
    } else if (editingField === 'speed') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistStats({ ...stats, speed: num });
    } else if (editingField === 'hpMax') {
      if (isNaN(num) || num < 1) { setEditingField(null); return; }
      persistStats({ ...stats, hpMax: num });
    } else if (editingField === 'hitDiceRemaining') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, hitDiceRemaining: Math.min(num, stats.level) });
    } else if (editingField === 'hpCurrent') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      const tempVal = parseInt(tempHpFieldInput, 10);
      persistResources({
        ...resources!,
        hpCurrent: Math.min(num, stats.hpMax),
        hpTemp: isNaN(tempVal) || tempVal < 0 ? resources!.hpTemp : tempVal,
      });
    } else if (editingField === 'tempHp') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, hpTemp: num });
    } else if (editingField === 'xp') {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      persistResources({ ...resources!, xp: num });
    } else if (typeof editingField === 'string' && editingField.startsWith('coin_')) {
      if (isNaN(num) || num < 0) { setEditingField(null); return; }
      const denom = editingField.replace('coin_', '') as 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
      const coins = resources!.coins ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
      persistResources({ ...resources!, coins: { ...coins, [denom]: num } });
    } else if (editingField === 'concentrationSpell') {
      const trimmed = val.slice(0, 80);
      persistResources({ ...resources!, concentrationSpell: trimmed || null });
    }

    setEditingField(null);
  }

  function applyAddXp() {
    if (!resources) { setXpAddMode(false); return; }
    const n = parseInt(xpAddInput, 10);
    if (isNaN(n) || n <= 0) { setXpAddMode(false); return; }
    persistResources({ ...resources, xp: (resources.xp ?? 0) + n });
    setXpAddMode(false);
    setXpAddInput('');
  }

  function getAttackBonus(item: Dnd5eEquipmentItem): number {
    if (item.attackBonus !== undefined) return item.attackBonus;
    if (!scores) return 0;
    let ability: 'strength' | 'dexterity' = 'strength';
    if (item.attackAbility === 'dexterity') ability = 'dexterity';
    else if (item.attackAbility === 'finesse') {
      ability = abilityMod(scores.dexterity) > abilityMod(scores.strength) ? 'dexterity' : 'strength';
    }
    return abilityMod(scores[ability]) + prof;
  }

  function getEquippedAC(): number {
    if (!scores) return 10;
    const armor = equipment.find((e) => e.slot === 'armor' && e.equipped);
    const shield = equipment.find((e) => e.slot === 'shield' && e.equipped);
    let base = 10 + abilityMod(scores.dexterity);
    if (armor) {
      const dexMod = abilityMod(scores.dexterity);
      const dexBonus = armor.dexCap !== undefined && armor.dexCap !== null
        ? Math.min(dexMod, armor.dexCap)
        : dexMod;
      base = (armor.acBase ?? 10) + dexBonus;
    }
    if (shield) base += shield.acBonus ?? 2;
    return base;
  }

  function saveEquipment(items: Dnd5eEquipmentItem[]) {
    if (!resources) return;
    persistResources({ ...resources, equipment: items });
  }

  function handleSaveEquipItem(item: Dnd5eEquipmentItem) {
    const existing = equipment.findIndex((e) => e.id === item.id);
    if (existing >= 0) {
      const updated = [...equipment];
      updated[existing] = item;
      saveEquipment(updated);
    } else {
      saveEquipment([...equipment, item]);
    }
    setEditEquip(null);
    setEquipModal(false);
  }

  function handleRemoveEquipItem(id: string) {
    saveEquipment(equipment.filter((e) => e.id !== id));
    setEditEquip(null);
    setEquipModal(false);
  }

  function handleToggleEquipped(id: string) {
    saveEquipment(equipment.map((e) => e.id === id ? { ...e, equipped: !e.equipped } : e));
  }

  function getFeatureList(cat: 'classFeatures' | 'speciesTraits' | 'feats'): Dnd5eFeature[] {
    return resources?.[cat] ?? [];
  }

  function saveFeature(cat: 'classFeatures' | 'speciesTraits' | 'feats', feature: Dnd5eFeature) {
    if (!resources) return;
    const list = getFeatureList(cat);
    const idx = list.findIndex((f) => f.id === feature.id);
    const updated = idx >= 0 ? list.map((f, i) => i === idx ? feature : f) : [...list, feature];
    persistResources({ ...resources, [cat]: updated });
    setEditFeature(null);
    setFeatureModal(false);
  }

  function removeFeature(cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string) {
    if (!resources) return;
    persistResources({ ...resources, [cat]: getFeatureList(cat).filter((f) => f.id !== id) });
    setEditFeature(null);
    setFeatureModal(false);
  }

  function toggleFeatureUse(cat: 'classFeatures' | 'speciesTraits' | 'feats', id: string, delta: number) {
    if (!resources) return;
    const list = getFeatureList(cat);
    persistResources({
      ...resources,
      [cat]: list.map((f) => {
        if (f.id !== id || !f.uses) return f;
        return { ...f, uses: { ...f.uses, current: Math.max(0, Math.min(f.uses.max, f.uses.current + delta)) } };
      }),
    });
  }

  function applyQuickHp() {
    if (!resources || !stats || !hpQuickMode) { setHpQuickMode(null); return; }
    const n = parseInt(hpQuickInput, 10);
    if (isNaN(n) || n <= 0) { setHpQuickMode(null); return; }
    if (hpQuickMode === 'damage') {
      const tempAbsorb = Math.min(resources.hpTemp, n);
      const remaining = n - tempAbsorb;
      persistResources({
        ...resources,
        hpCurrent: Math.max(0, resources.hpCurrent - remaining),
        hpTemp: resources.hpTemp - tempAbsorb,
      });
    } else {
      persistResources({
        ...resources,
        hpCurrent: Math.min(stats.hpMax, resources.hpCurrent + n),
      });
    }
    setHpQuickMode(null);
    setHpQuickInput('');
  }

  function applyTempHp() {
    if (!resources || !stats) { setHpQuickMode(null); return; }
    const n = parseInt(hpQuickInput, 10);
    if (isNaN(n) || n <= 0) { setHpQuickMode(null); return; }
    // Temp HP doesn't stack — take the higher value
    persistResources({ ...resources, hpTemp: Math.max(resources.hpTemp, n) });
    setHpQuickMode(null);
    setHpQuickInput('');
  }

  function handleToggleCondition(condition: string) {
    if (!character) return;
    const current = character.conditions ?? [];
    const lower = condition.toLowerCase();
    const exists = current.map((c) => c.toLowerCase()).includes(lower);
    logActivity({ kind: 'condition', name: condition, action: exists ? 'removed' : 'added' });
    persistConditions(exists ? current.filter((c) => c.toLowerCase() !== lower) : [...current, condition]);
  }

  function handleSetExhaustion(level: number) {
    if (!resources) return;
    const clamped = Math.max(0, level);
    const from = resources.exhaustionLevel ?? 0;
    if (from !== clamped) logActivity({ kind: 'exhaustion', from, to: clamped });
    persistResources({ ...resources, exhaustionLevel: clamped });
  }

  function logActivity(entry: ActivityInput) {
    setActivityLog((prev) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now(), ...entry } as ActivityEntry,
      ...prev,
    ].slice(0, 50));
  }

  function handleRoll(result: RollResult) {
    setRollResult(result);
    logActivity({ kind: 'roll', result });
    if (rollTimeoutRef.current) clearTimeout(rollTimeoutRef.current);
    rollTimeoutRef.current = setTimeout(() => setRollResult(null), 3000);
  }

  function handleDeathSave(type: 'success' | 'failure') {
    if (!resources) return;
    const ds = resources.deathSaves;
    const nextVal = type === 'success' ? (ds.successes + 1) % 4 : (ds.failures + 1) % 4;
    const prevVal = type === 'success' ? ds.successes : ds.failures;
    if (nextVal > prevVal) logActivity({ kind: 'deathSave', result: type });
    if (type === 'success') {
      persistResources({ ...resources, deathSaves: { ...ds, successes: nextVal } });
    } else {
      persistResources({ ...resources, deathSaves: { ...ds, failures: nextVal } });
    }
  }

  // ── Loading / Error ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (error || !character || !stats || !resources || !scores) {
    return (
      <View style={s.loadingContainer}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(drawer)/characters')} style={{ marginBottom: spacing.lg }}>
          <Text style={{ color: colors.brand, fontSize: 14 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.hpDanger }}>{error || 'Character not found.'}</Text>
      </View>
    );
  }

  const isDead = resources.deathSaves.failures >= 3;
  const isStabilized = resources.hpCurrent === 0 && resources.deathSaves.successes >= 3;
  const showDeathSaves = resources.hpCurrent === 0 && !isDead;
  const activeConditions = character.conditions ?? [];
  const exhaustionLevel = resources.exhaustionLevel ?? 0;
  const hpC = hpColor();


  const hpRatio = Math.max(0, Math.min(1, resources.hpCurrent / stats.hpMax));

  // ── Tab definitions — right rail is activity log, Skills is its own tab ──
  const DESKTOP_TAB_DEFS = [
    { id: 'combat',  icon: 'sword-cross' as const,        label: 'Combat' },
    { id: 'spells',  icon: 'auto-fix' as const,           label: 'Spells' },
    { id: 'skills',  icon: 'star-outline' as const,       label: 'Skills' },
    { id: 'traits',  icon: 'lightning-bolt-outline' as const, label: 'Traits' },
    { id: 'gear',    icon: 'bag-personal-outline' as const, label: 'Gear' },
    { id: 'lore',    icon: 'book-open-outline' as const,  label: 'Lore' },
  ];
  const MOBILE_TAB_DEFS = [
    { id: 'combat',  icon: 'sword-cross' as const,        label: 'Combat' },
    { id: 'spells',  icon: 'auto-fix' as const,           label: 'Spells' },
    { id: 'skills',  icon: 'star-outline' as const,       label: 'Skills' },
    { id: 'traits',  icon: 'lightning-bolt-outline' as const, label: 'Traits' },
    { id: 'gear',    icon: 'bag-personal-outline' as const, label: 'Gear' },
    { id: 'lore',    icon: 'book-open-outline' as const,  label: 'Lore' },
  ];
  const TAB_DEFS = isDesktop ? DESKTOP_TAB_DEFS : MOBILE_TAB_DEFS;

  // ── Tab panel content ────────────────────────────────────────────────────
  function renderTab(id: TabId) {
    if (!stats || !resources || !scores) return null;
    switch (id) {
      case 'combat':
        return (
          <CombatTab
            stats={stats}
            resources={resources}
            scores={scores}
            prof={prof}
            activeConditions={activeConditions}
            canEditAny={canEditAny}
            equipment={equipment}
            isDesktop={isDesktop}
            onRoll={handleRoll}
            onToggleCondition={handleToggleCondition}
            onSetExhaustion={handleSetExhaustion}
            getAttackBonus={getAttackBonus}
            onOpenHpModal={() => setHpModalVisible(true)}
          />
        );
      case 'spells':
        return (
          <SpellsTab
            stats={stats}
            resources={resources}
            scores={scores}
            prof={prof}
            isOwner={isOwner}
            onSpellSlotChange={(level, delta) => {
              if (!resources.spellSlots) return;
              const slot = resources.spellSlots[level];
              const next = Math.max(0, Math.min(slot.max, slot.remaining + delta));
              persistResources({
                ...resources,
                spellSlots: { ...resources.spellSlots, [level]: { ...slot, remaining: next } },
              });
            }}
            onConcentrationClear={() => persistResources({ ...resources, concentrationSpell: null })}
          />
        );
      case 'skills':
        return <SkillsTab stats={stats} scores={scores} prof={prof} onRoll={handleRoll} />;
      case 'traits':
        return (
          <AbilitiesTab
            stats={stats}
            resources={resources}
            isOwner={isOwner}
            onToggleFeatureUse={toggleFeatureUse}
            onAddFeature={(cat) => {
              setFeatureCategory(cat);
              setEditFeature({ id: Date.now().toString(), name: '', description: '' });
              setFeatureModal(true);
            }}
            onEditFeature={(cat, feature) => {
              setFeatureCategory(cat);
              setEditFeature(feature);
              setFeatureModal(true);
            }}
          />
        );
      case 'gear':
        return (
          <GearTab
            stats={stats}
            resources={resources}
            isOwner={isOwner}
            strengthScore={scores.strength}
            onUpdateCoins={(coins) => persistResources({ ...resources, coins })}
            onToggleEquipped={handleToggleEquipped}
            onUpdateNotes={(notes) => persistResources({ ...resources, notes })}
            onUpdateTreasure={(treasure) => persistResources({ ...resources, treasure })}
          />
        );
      case 'lore':
        return (
          <LoreTab
            stats={stats}
            resources={resources}
            isOwner={isOwner}
            onPersonalityChange={(field, value) =>
              persistResources({ ...resources, personality: { ...resources.personality, [field]: value } })
            }
            onAppearanceChange={(field, value) =>
              persistResources({ ...resources, appearance: { ...resources.appearance, [field]: value } })
            }
          />
        );
    }
  }

  // ── Portrait helper ──────────────────────────────────────────────────────
  const portraitContent = portraitUploading
    ? <ActivityIndicator color={colors.primary} size="small" />
    : (character as any).avatar_url
      ? <Image source={{ uri: (character as any).avatar_url }} style={isDesktop ? s.deskPortraitImg : s.chromePortraitImg} />
      : <MaterialCommunityIcons name="account-outline" size={isDesktop ? 32 : 24} color={colors.outline} />;

  return (
    <View style={s.root}>

      {isDesktop ? (
        /* ════════════════════════════════════════════════════════════════
           DESKTOP LAYOUT — two-column sidebar
           ════════════════════════════════════════════════════════════════ */
        <DndProvider backend={HTML5Backend}>
        <View style={s.deskShell}>

          {/* ── Left rail ───────────────────────────────────────────── */}
          <View style={s.deskRail}>

            {/* Back + portrait + name */}
            <View style={s.deskHeader}>
              <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(drawer)/characters')} style={s.deskBackBtn} hitSlop={8}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={colors.onSurfaceVariant} />
                <Text style={s.deskBackLabel}>Characters</Text>
              </TouchableOpacity>

              <View style={s.deskIdentityRow}>
                <TouchableOpacity style={s.deskPortrait} onPress={handlePickPortrait} disabled={portraitUploading} activeOpacity={0.85}>
                  {portraitContent}
                </TouchableOpacity>

                <View style={s.deskNameBlock}>
                  {editingName ? (
                    <TextInput
                      style={s.deskNameInput}
                      value={nameInput}
                      onChangeText={setNameInput}
                      onBlur={() => { if (nameInput.trim()) persistName(nameInput.trim()); setEditingName(false); }}
                      onSubmitEditing={() => { if (nameInput.trim()) persistName(nameInput.trim()); setEditingName(false); }}
                      autoFocus returnKeyType="done"
                    />
                  ) : (
                    <TouchableOpacity onPress={() => isOwner && (setNameInput(stats.characterName), setEditingName(true))} activeOpacity={isOwner ? 0.7 : 1}>
                      <Text style={s.deskName} numberOfLines={2}>{stats.characterName}</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={s.deskSub} numberOfLines={1}>
                    {capitalize(stats.speciesKey)} {capitalize(stats.classKey)}
                  </Text>
                  <Text style={s.deskLevel}>Level {stats.level}</Text>
                </View>

                <View style={s.deskHeaderIcons}>
                  <TouchableOpacity
                    style={[s.deskIconBtn, resources.inspiration && s.deskIconBtnActive]}
                    onPress={() => canEditAny && persistResources({ ...resources, inspiration: !resources.inspiration })}
                    hitSlop={6} activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={resources.inspiration ? 'star' : 'star-outline'}
                      size={16}
                      color={resources.inspiration ? colors.gm : colors.outline}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.deskIconBtn} onPress={() => setSettingsModal(true)} hitSlop={6}>
                    <MaterialCommunityIcons name="cog-outline" size={16} color={colors.outline} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* ── Stats block ─────────────────────────────────────── */}
            <View style={s.deskStats}>
              {/* HP section */}
              <View style={s.deskHpBox}>
                <Text style={s.deskHpSectionLabel}>Hit Points</Text>
                <View style={s.deskHpCenterRow}>
                  <TouchableOpacity
                    style={s.deskHpActionBtn}
                    onPress={() => canEditAny && (setHpQuickInput(''), setHpQuickMode('damage'))}
                    disabled={!canEditAny}
                    activeOpacity={0.7}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="sword" size={20} color={colors.hpDanger} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.deskHpNumsCenter}
                    onPress={() => canEditAny && setHpModalVisible(true)}
                    onLongPress={() => canEditAny && setHpModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.deskHpCurrent, { color: hpC }]}>{resources.hpCurrent}</Text>
                    <Text style={s.deskHpSep}>/</Text>
                    <Text style={s.deskHpMax}>{stats.hpMax}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={s.deskHpActionBtn}
                    onPress={() => canEditAny && (setHpQuickInput(''), setHpQuickMode('heal'))}
                    disabled={!canEditAny}
                    activeOpacity={0.7}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="heart-plus" size={20} color={colors.hpHealthy} />
                  </TouchableOpacity>
                </View>

                <View style={s.deskHpTrack}>
                  <View style={[s.deskHpFill, { width: `${hpRatio * 100}%` as any, backgroundColor: hpC }]} />
                  {resources.hpTemp > 0 && (
                    <View style={[s.deskHpTempFill, {
                      width: `${Math.min((1 - hpRatio) * 100, (resources.hpTemp / stats.hpMax) * 100)}%` as any,
                    }]} />
                  )}
                </View>

                <View style={s.deskHpMeta}>
                  {resources.hpTemp > 0
                    ? <Text style={s.deskHpTempLabel}>+{resources.hpTemp} temp</Text>
                    : <View />}
                  {resources.inspiration && (
                    <View style={s.deskHpInspired}>
                      <MaterialCommunityIcons name="star" size={11} color={colors.gm} />
                      <Text style={s.deskHpInspiredLabel}>Inspired</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* ── Death Saves (only at 0 HP) ── */}
              {resources.hpCurrent === 0 && (
                <View style={s.deskDeathBox}>
                  <Text style={[
                    s.deskDeathLabel,
                    isDead && { color: colors.hpDanger },
                    isStabilized && { color: colors.hpHealthy },
                  ]}>
                    {isDead ? 'DEAD' : isStabilized ? 'STABLE' : 'DEATH SAVES'}
                  </Text>
                  {!isDead && (
                    <View style={s.deskDeathPipRows}>
                      <View style={s.deskDeathPipRow}>
                        <Text style={[s.deskDeathPipLabel, { color: colors.hpHealthy }]}>S</Text>
                        {[0, 1, 2].map((i) => (
                          <TouchableOpacity
                            key={i}
                            onPress={() => canEditAny && handleDeathSave('success')}
                            activeOpacity={canEditAny ? 0.7 : 1}
                          >
                            <View style={[s.deskDeathPip, i < resources.deathSaves.successes && s.deskDeathPipSuccess]} />
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={s.deskDeathPipRow}>
                        <Text style={[s.deskDeathPipLabel, { color: colors.hpDanger }]}>F</Text>
                        {[0, 1, 2].map((i) => (
                          <TouchableOpacity
                            key={i}
                            onPress={() => canEditAny && handleDeathSave('failure')}
                            activeOpacity={canEditAny ? 0.7 : 1}
                          >
                            <View style={[s.deskDeathPip, i < resources.deathSaves.failures && s.deskDeathPipFailure]} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              {/* Conditions */}
              <View style={s.deskConditions}>
                <Text style={s.deskSectionLabel}>Conditions</Text>
                <ConditionsSection
                  activeConditions={activeConditions}
                  exhaustionLevel={exhaustionLevel}
                  canEditAny={canEditAny}
                  onToggle={handleToggleCondition}
                  onSetExhaustion={handleSetExhaustion}
                />
              </View>

              {/* Stat grid — AC full row, then 2+2 */}
              <View style={s.deskStatGrid}>
                {/* Row 1: AC solo */}
                <View style={s.deskStatRow}>
                  <StatCell icon="shield-outline" value={String(ac)} label="Armor Class" color={colors.secondary} centered />
                </View>
                {/* Row 2: Speed | Initiative */}
                <View style={s.deskStatRow}>
                  <StatCell icon="run-fast"       value={`${stats.speed} ft`} label="Speed"      color={colors.onSurface} />
                  <StatCell icon="lightning-bolt" value={fmtMod(initiative)}  label="Initiative" color={colors.onSurface} />
                </View>
                {/* Row 3: Prof | Hit Die */}
                <View style={s.deskStatRow}>
                  <StatCell icon="star-four-points" value={fmtMod(prof)}       label="Prof"    color={colors.onSurface} />
                  <StatCell icon="dice-d8-outline"  value={`d${stats.hitDie}`} label="Hit Die" color={colors.onSurface} />
                </View>
              </View>
            </View>

            {/* ── Senses (passive skills) ───────────────────────────── */}
            <View style={s.deskSection}>
              <Text style={s.deskSectionLabel}>Senses</Text>
              {(['perception', 'investigation', 'insight'] as const).map((skill) => {
                const abi: keyof Dnd5eAbilityScores = skill === 'investigation' ? 'intelligence' : 'wisdom';
                const isProficient = stats.skillProficiencies?.includes(skill) ?? false;
                const passive = 10 + abilityMod(scores[abi]) + (isProficient ? prof : 0);
                return (
                  <View key={skill} style={s.deskAbilityRow}>
                    <View style={[s.deskAbilDot, isProficient && s.deskAbilDotProf]} />
                    <Text style={s.deskAbilName}>Passive {capitalize(skill)}</Text>
                    <Text style={[s.deskAbilSaveVal, isProficient && { color: colors.primary }]}>{passive}</Text>
                  </View>
                );
              })}
            </View>

            {/* ── Saving Throws ─────────────────────────────────────── */}
            <View style={s.deskSection}>
              <Text style={s.deskSectionLabel}>Saving Throws</Text>
              {ABILITY_KEYS.map((key) => {
                const mod = abilityMod(scores[key]);
                const isProficient = stats.savingThrowProficiencies?.includes(key) ?? false;
                const saveBonus = mod + (isProficient ? prof : 0);
                return (
                  <TouchableOpacity
                    key={key}
                    style={s.deskAbilityRow}
                    onPress={() => handleRoll({ label: `${ABILITY_SHORT[key]} Save`, rolls: [Math.floor(Math.random() * 20) + 1], bonus: saveBonus, total: Math.floor(Math.random() * 20) + 1 + saveBonus })}
                    activeOpacity={0.7}
                  >
                    <View style={[s.deskAbilDot, isProficient && s.deskAbilDotProf]} />
                    <Text style={s.deskAbilName}>{capitalize(key)}</Text>
                    <Text style={[s.deskAbilSaveVal, isProficient && { color: colors.primary }]}>{fmtMod(saveBonus)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Campaign link ─────────────────────────────────────── */}
            <View style={{ flex: 1 }} />
            <View style={s.deskCampSection}>
              <View style={s.deskCampCard}>
                <MaterialCommunityIcons name="castle" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.deskCampCardLbl}>Campaign</Text>
                  <Text style={s.deskCampCardName} numberOfLines={1}>Not linked</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} style={{ opacity: 0.6 }} />
              </View>
            </View>

          </View>

          {/* ── Center content pane ─────────────────────────────────── */}
          <View style={s.deskContent}>
            <View style={s.deskPanes}>
              {/* Left pane */}
              <TabPane
                tabs={tabLayout.left}
                activeId={tabLayout.activeLeft}
                side="left"
                onActivate={(id) => setSideActive('left', id)}
                onMoveToSide={(id, toSide) => moveTab(id, toSide)}
                renderTab={renderTab}
              />
              {tabLayout.right.length > 0 ? (
                <>
                  <View style={s.deskPaneDivider} />
                  <TabPane
                    tabs={tabLayout.right}
                    activeId={tabLayout.activeRight ?? tabLayout.right[0]}
                    side="right"
                    onActivate={(id) => setSideActive('right', id)}
                    onMoveToSide={(id, toSide) => moveTab(id, toSide)}
                    renderTab={renderTab}
                  />
                </>
              ) : (
                <SplitDropZone onMove={(id) => moveTab(id, 'right')} />
              )}
            </View>
          </View>

          {/* ── Activity log rail (right side, collapsible) ─────────── */}
          {!rightRailCollapsed && (
            <View style={s.skillsRail}>
              <View style={s.skillsRailHead}>
                <View>
                  <Text style={s.skillsRailTitle}>Activity Log</Text>
                  <Text style={s.skillsRailSub}>{activityLog.length} event{activityLog.length === 1 ? '' : 's'}</Text>
                </View>
                <TouchableOpacity onPress={() => setRightRailCollapsed(true)} hitSlop={8}>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.outline} />
                </TouchableOpacity>
              </View>
              {activityLog.length === 0 ? (
                <Text style={s.logRailEmpty}>No activity yet.</Text>
              ) : (
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {activityLog.map((entry) => {
                    const d = describeEntry(entry);
                    return (
                      <View key={entry.id} style={s.logRailRow}>
                        <MaterialCommunityIcons name={d.icon as any} size={12} color={d.accent} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={s.logRailLabel} numberOfLines={1}>{d.label}</Text>
                          {!!d.detail && <Text style={s.logRailDice} numberOfLines={1}>{d.detail}</Text>}
                        </View>
                        {!!d.total && <Text style={[s.logRailTotal, { color: d.accent }]}>{d.total}</Text>}
                      </View>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          )}
          {rightRailCollapsed && (
            <TouchableOpacity style={s.skillsRailCollapsed} onPress={() => setRightRailCollapsed(false)} activeOpacity={0.7}>
              <MaterialCommunityIcons name="chevron-left" size={16} color={colors.outline} />
              <Text style={s.skillsRailCollapsedLabel}>Log</Text>
            </TouchableOpacity>
          )}

        </View>
        </DndProvider>

      ) : (
        /* ════════════════════════════════════════════════════════════════
           MOBILE LAYOUT — stacked HUD
           ════════════════════════════════════════════════════════════════ */
        <>
          {/* Top Chrome */}
          <View style={s.topChrome}>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(drawer)/characters')} style={s.backBtn} hitSlop={8}>
              <MaterialCommunityIcons name="chevron-left" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>

            <TouchableOpacity style={s.chromePortrait} onPress={handlePickPortrait} disabled={portraitUploading} activeOpacity={0.85}>
              {portraitContent}
            </TouchableOpacity>

            <View style={s.chromeIdentity}>
              {editingName ? (
                <TextInput
                  style={s.chromeNameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  onBlur={() => { if (nameInput.trim()) persistName(nameInput.trim()); setEditingName(false); }}
                  onSubmitEditing={() => { if (nameInput.trim()) persistName(nameInput.trim()); setEditingName(false); }}
                  autoFocus returnKeyType="done"
                />
              ) : (
                <TouchableOpacity onPress={() => isOwner && (setNameInput(stats.characterName), setEditingName(true))} activeOpacity={isOwner ? 0.7 : 1}>
                  <Text style={s.chromeName} numberOfLines={1}>{stats.characterName}</Text>
                </TouchableOpacity>
              )}
              <Text style={s.chromeSub} numberOfLines={1}>
                {capitalize(stats.speciesKey)} {capitalize(stats.classKey)} · Lv {stats.level}
              </Text>
            </View>

            <TouchableOpacity
              style={[s.inspirationBtn, resources.inspiration && s.inspirationBtnActive]}
              onPress={() => canEditAny && persistResources({ ...resources, inspiration: !resources.inspiration })}
              activeOpacity={0.7} hitSlop={6}
            >
              <MaterialCommunityIcons
                name={resources.inspiration ? 'star' : 'star-outline'}
                size={18}
                color={resources.inspiration ? colors.gm : colors.outline}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setLogModal(true)} hitSlop={8} style={s.settingsIconBtn}>
              <MaterialCommunityIcons name="notebook-outline" size={20} color={colors.outline} />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSettingsModal(true)} hitSlop={8} style={s.settingsIconBtn}>
              <MaterialCommunityIcons name="cog-outline" size={20} color={colors.outline} />
            </TouchableOpacity>
          </View>

          {/* Stat Rail */}
          <View style={s.statRail}>
            <View style={s.railStat}>
              <Text style={[s.railValue, { color: colors.secondary }]}>{ac}</Text>
              <Text style={s.railLabel}>AC</Text>
            </View>
            <TouchableOpacity
              style={s.railHp}
              onPress={() => canEditAny && (setHpQuickInput(''), setHpQuickMode('damage'))}
              onLongPress={() => canEditAny && (setHpQuickInput(''), setHpQuickMode('heal'))}
              activeOpacity={0.8}
            >
              <View style={s.hpNumRow}>
                <Text style={[s.railHpCurrent, { color: hpC }]}>{resources.hpCurrent}</Text>
                <Text style={s.railHpSep}>/</Text>
                <Text style={s.railHpMax}>{stats.hpMax}</Text>
                {resources.hpTemp > 0 && <Text style={s.railHpTemp}>+{resources.hpTemp}</Text>}
              </View>
              <View style={s.hpTrack}>
                <View style={[s.hpFill, { width: `${hpRatio * 100}%` as any, backgroundColor: hpC }]} />
                {resources.hpTemp > 0 && (
                  <View style={[s.hpTempFill, {
                    width: `${Math.min((1 - hpRatio) * 100, (resources.hpTemp / stats.hpMax) * 100)}%` as any,
                  }]} />
                )}
              </View>
              <Text style={s.railLabel}>HP{showDeathSaves ? ' · SAVE' : isDead ? ' · DEAD' : isStabilized ? ' · STABLE' : ''}</Text>
            </TouchableOpacity>
            <View style={s.railStat}>
              <Text style={s.railValue}>{fmtMod(initiative)}</Text>
              <Text style={s.railLabel}>INIT</Text>
            </View>
            <View style={s.railStat}>
              <Text style={s.railValue}>{stats.speed}</Text>
              <Text style={s.railLabel}>SPD</Text>
            </View>
            <View style={s.railStat}>
              <Text style={[s.railValue, { color: colors.primary }]}>{fmtMod(prof)}</Text>
              <Text style={s.railLabel}>PROF</Text>
            </View>
          </View>

          {/* Tab content */}
          <View style={{ flex: 1 }}>{renderTab(activeTab)}</View>

          {/* Bottom tab bar */}
          <View style={s.tabBar}>
            {TAB_DEFS.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[s.tabBtn, activeTab === tab.id && s.tabBtnActive]}
                onPress={() => setActiveTab(tab.id as 'combat' | 'spells' | 'skills' | 'traits' | 'gear' | 'lore')}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons
                  name={tab.icon}
                  size={20}
                  color={activeTab === tab.id ? colors.primary : colors.outline}
                />
                <Text style={[s.tabLabel, activeTab === tab.id && s.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {/* Roll Toast — works for both layouts */}
      <RollToast result={rollResult} />

      {/* ── Modals ───────────────────────────────────────────────────── */}
      <HpModal
        visible={hpModalVisible}
        resources={resources}
        hpMax={stats.hpMax}
        onClose={() => setHpModalVisible(false)}
        onApply={persistResources}
      />

      {/* Activity log modal */}
      <Modal visible={logModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setLogModal(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Activity Log</Text>
              <TouchableOpacity onPress={() => setLogModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {activityLog.length === 0 ? (
              <Text style={s.logEmpty}>No activity yet — your rolls and changes will appear here.</Text>
            ) : (
              <ScrollView style={s.logList} showsVerticalScrollIndicator={false}>
                {activityLog.map((entry) => {
                  const d = describeEntry(entry);
                  return (
                    <View key={entry.id} style={s.logRow}>
                      <MaterialCommunityIcons name={d.icon as any} size={18} color={d.accent} style={{ marginRight: 4 }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={s.logLabel} numberOfLines={1}>{d.label}</Text>
                        {!!d.detail && <Text style={s.logDice}>{d.detail}</Text>}
                      </View>
                      {!!d.total && <Text style={[s.logTotal, { color: d.accent }]}>{d.total}</Text>}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Settings modal */}
      <Modal visible={settingsModal} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setSettingsModal(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Character Settings</Text>
              <TouchableOpacity onPress={() => setSettingsModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={s.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.settingLabel}>Manual Mode</Text>
                <Text style={s.settingDesc}>
                  Edit all stats freely — ability scores, level, speed, HP max, and more.
                </Text>
              </View>
              <Switch
                value={manualMode}
                onValueChange={handleToggleManualMode}
                trackColor={{ false: colors.border, true: colors.brand + '66' }}
                thumbColor={manualMode ? colors.brand : colors.textSecondary}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>


      {/* Field edit modal */}
      <Modal visible={!!editingField} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setEditingField(null)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>
              {editingField === 'hpCurrent' ? 'Edit Hit Points' : `Edit ${editingField ? (ABILITY_SHORT[editingField as keyof Dnd5eAbilityScores] || capitalize(editingField)) : ''}`}
            </Text>
            {editingField === 'hpCurrent' ? (
              <>
                <View style={s.hpEditRow}>
                  <View style={s.hpEditField}>
                    <Text style={s.hpEditLabel}>Current HP</Text>
                    <TextInput
                      style={s.fieldInput}
                      value={fieldInput}
                      onChangeText={setFieldInput}
                      keyboardType="number-pad"
                      autoFocus
                      returnKeyType="next"
                    />
                  </View>
                  <View style={s.hpEditField}>
                    <Text style={[s.hpEditLabel, { color: '#3B82F6' }]}>Temp HP</Text>
                    <TextInput
                      style={[s.fieldInput, { borderColor: '#3B82F6' }]}
                      value={tempHpFieldInput}
                      onChangeText={setTempHpFieldInput}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={saveEditField}
                    />
                  </View>
                </View>
              </>
            ) : editingField === 'concentrationSpell' ? (
              <TextInput
                style={s.fieldInput}
                value={fieldInput}
                onChangeText={setFieldInput}
                placeholder="Spell name"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveEditField}
              />
            ) : (
              <TextInput
                style={s.fieldInput}
                value={fieldInput}
                onChangeText={setFieldInput}
                keyboardType="number-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveEditField}
              />
            )}
            <TouchableOpacity style={s.fieldSaveBtn} onPress={saveEditField}>
              <Text style={s.fieldSaveBtnText}>Save</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Feature edit modal */}
      <Modal visible={featureModal && !!editFeature} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setFeatureModal(false)}>
          <Pressable style={[s.modalCard, { maxWidth: 440 }]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editFeature?.name ? 'Edit Feature' : 'Add Feature'}
              </Text>
              <TouchableOpacity onPress={() => setFeatureModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {editFeature && (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={s.eqLabel}>Name</Text>
                <TextInput
                  style={s.eqInput}
                  value={editFeature.name}
                  onChangeText={(t) => setEditFeature({ ...editFeature, name: t })}
                  placeholder="e.g. Second Wind, Darkvision"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />

                <Text style={s.eqLabel}>Description</Text>
                <TextInput
                  style={[s.eqInput, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={editFeature.description}
                  onChangeText={(t) => setEditFeature({ ...editFeature, description: t })}
                  placeholder="What does this feature do?"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                />

                <Text style={s.eqLabel}>Has Limited Uses?</Text>
                <View style={s.eqSlotRow}>
                  <TouchableOpacity
                    style={[s.eqSlotBtn, !editFeature.uses && s.eqSlotBtnActive]}
                    onPress={() => setEditFeature({ ...editFeature, uses: undefined })}
                  >
                    <Text style={[s.eqSlotText, !editFeature.uses && s.eqSlotTextActive]}>Passive</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.eqSlotBtn, !!editFeature.uses && s.eqSlotBtnActive]}
                    onPress={() => setEditFeature({ ...editFeature, uses: editFeature.uses ?? { current: 1, max: 1, recharge: 'long' } })}
                  >
                    <Text style={[s.eqSlotText, !!editFeature.uses && s.eqSlotTextActive]}>Has Uses</Text>
                  </TouchableOpacity>
                </View>

                {editFeature.uses && (
                  <>
                    <Text style={s.eqLabel}>Max Uses</Text>
                    <TextInput
                      style={s.eqInput}
                      value={String(editFeature.uses.max)}
                      onChangeText={(t) => {
                        const n = parseInt(t, 10) || 1;
                        setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, max: n, current: Math.min(editFeature.uses!.current, n) } });
                      }}
                      keyboardType="number-pad"
                    />
                    <Text style={s.eqLabel}>Recharge</Text>
                    <View style={s.eqSlotRow}>
                      <TouchableOpacity
                        style={[s.eqSlotBtn, editFeature.uses.recharge === 'short' && s.eqSlotBtnActive]}
                        onPress={() => setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, recharge: 'short' } })}
                      >
                        <Text style={[s.eqSlotText, editFeature.uses.recharge === 'short' && s.eqSlotTextActive]}>Short Rest</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.eqSlotBtn, editFeature.uses.recharge === 'long' && s.eqSlotBtnActive]}
                        onPress={() => setEditFeature({ ...editFeature, uses: { ...editFeature.uses!, recharge: 'long' } })}
                      >
                        <Text style={[s.eqSlotText, editFeature.uses.recharge === 'long' && s.eqSlotTextActive]}>Long Rest</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[s.fieldSaveBtn, { marginTop: spacing.md }]}
                  onPress={() => saveFeature(featureCategory, editFeature)}
                >
                  <Text style={s.fieldSaveBtnText}>Save</Text>
                </TouchableOpacity>

                {getFeatureList(featureCategory).some((f) => f.id === editFeature.id) && (
                  <TouchableOpacity
                    style={s.eqDeleteBtn}
                    onPress={() => removeFeature(featureCategory, editFeature.id)}
                  >
                    <Text style={s.eqDeleteText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add XP modal */}
      <Modal visible={xpAddMode} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setXpAddMode(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.quickHpHeader}>
              <MaterialCommunityIcons name="star-four-points-outline" size={24} color={colors.brand} />
              <Text style={s.modalTitle}>Add XP</Text>
            </View>
            <TextInput
              style={[s.quickHpInput, { borderColor: colors.brand }]}
              value={xpAddInput}
              onChangeText={setXpAddInput}
              keyboardType="number-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={applyAddXp}
            />
            <TouchableOpacity
              style={[s.fieldSaveBtn, { opacity: xpAddInput.trim() ? 1 : 0.4 }]}
              onPress={applyAddXp}
              disabled={!xpAddInput.trim()}
            >
              <Text style={s.fieldSaveBtnText}>Add XP</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Equipment edit modal */}
      <Modal visible={equipModal && !!editEquip} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setEquipModal(false)}>
          <Pressable style={[s.modalCard, { maxWidth: 440 }]} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {editEquip?.name ? 'Edit Item' : 'Add Item'}
              </Text>
              <TouchableOpacity onPress={() => setEquipModal(false)}>
                <MaterialCommunityIcons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {editEquip && (
              <ScrollView style={{ maxHeight: 400 }}>
                <Text style={s.eqLabel}>Name</Text>
                <TextInput
                  style={s.eqInput}
                  value={editEquip.name}
                  onChangeText={(t) => setEditEquip({ ...editEquip, name: t })}
                  placeholder="e.g. Longsword, Chain Mail"
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                />

                <Text style={s.eqLabel}>Type</Text>
                <View style={s.eqSlotRow}>
                  {(['weapon', 'armor', 'shield', 'other'] as EquipmentSlot[]).map((sl) => (
                    <TouchableOpacity
                      key={sl}
                      style={[s.eqSlotBtn, editEquip.slot === sl && s.eqSlotBtnActive]}
                      onPress={() => setEditEquip({ ...editEquip, slot: sl })}
                    >
                      <Text style={[s.eqSlotText, editEquip.slot === sl && s.eqSlotTextActive]}>
                        {capitalize(sl)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {editEquip.slot === 'weapon' && (
                  <>
                    <Text style={s.eqLabel}>Damage (e.g. 1d8+3 slashing)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.damage ?? ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, damage: t })}
                      placeholder="1d8+3 slashing"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Attack Ability</Text>
                    <View style={s.eqSlotRow}>
                      {(['strength', 'dexterity', 'finesse'] as const).map((ab) => (
                        <TouchableOpacity
                          key={ab}
                          style={[s.eqSlotBtn, editEquip.attackAbility === ab && s.eqSlotBtnActive]}
                          onPress={() => setEditEquip({ ...editEquip, attackAbility: ab })}
                        >
                          <Text style={[s.eqSlotText, editEquip.attackAbility === ab && s.eqSlotTextActive]}>
                            {capitalize(ab)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={s.eqLabel}>Range (ft)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.range ?? ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, range: t })}
                      placeholder="5 or 80/320"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Properties (comma separated)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={(editEquip.properties ?? []).join(', ')}
                      onChangeText={(t) => setEditEquip({ ...editEquip, properties: t.split(',').map((p) => p.trim()).filter(Boolean) })}
                      placeholder="finesse, light, versatile"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {editEquip.slot === 'armor' && (
                  <>
                    <Text style={s.eqLabel}>Base AC</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.acBase !== undefined ? String(editEquip.acBase) : ''}
                      onChangeText={(t) => setEditEquip({ ...editEquip, acBase: parseInt(t, 10) || undefined })}
                      keyboardType="number-pad"
                      placeholder="e.g. 14"
                      placeholderTextColor={colors.textSecondary}
                    />
                    <Text style={s.eqLabel}>Max DEX Bonus (blank = no cap)</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.dexCap !== undefined && editEquip.dexCap !== null ? String(editEquip.dexCap) : ''}
                      onChangeText={(t) => {
                        const n = parseInt(t, 10);
                        setEditEquip({ ...editEquip, dexCap: isNaN(n) ? null : n });
                      }}
                      keyboardType="number-pad"
                      placeholder="e.g. 2 (or blank for full DEX)"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {editEquip.slot === 'shield' && (
                  <>
                    <Text style={s.eqLabel}>AC Bonus</Text>
                    <TextInput
                      style={s.eqInput}
                      value={editEquip.acBonus !== undefined ? String(editEquip.acBonus) : '2'}
                      onChangeText={(t) => setEditEquip({ ...editEquip, acBonus: parseInt(t, 10) || 2 })}
                      keyboardType="number-pad"
                      placeholder="2"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </>
                )}

                {/* Attunement toggles */}
                <TouchableOpacity
                  style={s.eqToggleRow}
                  onPress={() => setEditEquip({ ...editEquip, requiresAttunement: !editEquip.requiresAttunement, attuned: false })}
                >
                  <MaterialCommunityIcons
                    name={editEquip.requiresAttunement ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                    size={20} color={colors.brand}
                  />
                  <Text style={s.eqToggleText}>Requires Attunement</Text>
                </TouchableOpacity>

                {editEquip.requiresAttunement && (() => {
                  const currentlyAttuned = equipment.filter((e) => e.attuned && e.id !== editEquip.id).length;
                  const canAttune = currentlyAttuned < 3 || editEquip.attuned;
                  return (
                    <TouchableOpacity
                      style={[s.eqToggleRow, !canAttune && { opacity: 0.4 }]}
                      onPress={() => {
                        if (!canAttune) return;
                        setEditEquip({ ...editEquip, attuned: !editEquip.attuned });
                      }}
                    >
                      <MaterialCommunityIcons
                        name={editEquip.attuned ? 'star-four-points' : 'star-four-points-outline'}
                        size={20} color={colors.brand}
                      />
                      <Text style={s.eqToggleText}>
                        {editEquip.attuned ? 'Attuned' : 'Attune'}{!canAttune ? ' (max 3)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })()}

                <Text style={s.eqLabel}>Notes</Text>
                <TextInput
                  style={s.eqInput}
                  value={editEquip.notes ?? ''}
                  onChangeText={(t) => setEditEquip({ ...editEquip, notes: t })}
                  placeholder="Optional notes"
                  placeholderTextColor={colors.textSecondary}
                />

                <TouchableOpacity
                  style={[s.fieldSaveBtn, { marginTop: spacing.md }]}
                  onPress={() => handleSaveEquipItem(editEquip)}
                >
                  <Text style={s.fieldSaveBtnText}>Save</Text>
                </TouchableOpacity>

                {equipment.some((e) => e.id === editEquip.id) && (
                  <TouchableOpacity
                    style={s.eqDeleteBtn}
                    onPress={() => handleRemoveEquipItem(editEquip.id)}
                  >
                    <Text style={s.eqDeleteText}>Remove Item</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Quick damage/heal modal */}
      <Modal visible={!!hpQuickMode} transparent animationType="fade">
        <Pressable style={s.modalBackdrop} onPress={() => setHpQuickMode(null)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <View style={s.quickHpHeader}>
              <MaterialCommunityIcons
                name={hpQuickMode === 'damage' ? 'sword' : 'heart-plus'}
                size={24}
                color={hpQuickMode === 'damage' ? colors.hpDanger : colors.hpHealthy}
              />
              <Text style={s.modalTitle}>
                {hpQuickMode === 'damage' ? 'Deal Damage' : 'Heal'}
              </Text>
            </View>
            <TextInput
              style={[s.quickHpInput, {
                borderColor: hpQuickMode === 'damage' ? colors.hpDanger : colors.hpHealthy,
              }]}
              value={hpQuickInput}
              onChangeText={setHpQuickInput}
              keyboardType="number-pad"
              placeholder="Amount"
              placeholderTextColor={colors.textSecondary}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={applyQuickHp}
            />
            {hpQuickMode === 'damage' ? (
              <TouchableOpacity
                style={[s.fieldSaveBtn, { backgroundColor: colors.hpDanger, opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                onPress={applyQuickHp}
                disabled={!hpQuickInput.trim()}
              >
                <Text style={s.fieldSaveBtnText}>Apply Damage</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.healBtnRow}>
                <TouchableOpacity
                  style={[s.healBtn, { backgroundColor: colors.hpHealthy, opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                  onPress={applyQuickHp}
                  disabled={!hpQuickInput.trim()}
                >
                  <Text style={s.fieldSaveBtnText}>Apply Healing</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.healBtn, { backgroundColor: '#3B82F6', opacity: hpQuickInput.trim() ? 1 : 0.4 }]}
                  onPress={applyTempHp}
                  disabled={!hpQuickInput.trim()}
                >
                  <Text style={s.fieldSaveBtnText}>Apply Temp HP</Text>
                </TouchableOpacity>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const CARD = {
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: 14,
  padding: spacing.md,
  overflow: 'hidden' as const,
};

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceCanvas },
  scroll: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: 48 },
  loadingContainer: {
    flex: 1, backgroundColor: colors.surfaceCanvas,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── HUD layout ──────────────────────────────────────────────────────────────
  topChrome: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  backBtn: { padding: 4 },
  chromePortrait: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
  },
  chromePortraitImg: { width: 36, height: 36, borderRadius: 18 },
  chromeIdentity: { flex: 1, minWidth: 0 },
  chromeName: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.2,
  },
  chromeNameInput: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.primary, borderBottomWidth: 1, borderBottomColor: colors.primary,
    paddingVertical: 1,
  },
  chromeSub: {
    fontSize: 11, fontFamily: fonts.label, color: colors.outline,
    marginTop: 1, textTransform: 'capitalize',
  },
  inspirationBtn: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  inspirationBtnActive: { borderColor: colors.gm, backgroundColor: colors.gmContainer },
  settingsIconBtn: { padding: 4 },

  statRail: {
    flexDirection: 'row', alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  railStat: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 2,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.outlineVariant,
  },
  railValue: {
    fontSize: 16, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface,
  },
  railLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
  },
  railHp: {
    flex: 2.2, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 8,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.outlineVariant,
    gap: 3,
  },
  hpNumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  railHpCurrent: { fontSize: 20, fontFamily: fonts.headline, fontWeight: '800', lineHeight: 22 },
  railHpSep: { fontSize: 12, color: colors.outline, marginHorizontal: 1 },
  railHpMax: { fontSize: 12, fontFamily: fonts.headline, fontWeight: '600', color: colors.outline },
  railHpTemp: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: '#3B82F6', marginLeft: 2 },
  hpTrack: {
    width: '90%', height: 4, borderRadius: 2,
    backgroundColor: colors.outlineVariant, flexDirection: 'row', overflow: 'hidden',
  },
  hpFill: { height: '100%', borderRadius: 2 },
  hpTempFill: { height: '100%', backgroundColor: '#3B82F6' },

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
    paddingBottom: Platform.OS === 'ios' ? 20 : 6,
  },
  tabBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 8, paddingBottom: 4, gap: 3,
  },
  tabBtnActive: {},
  tabLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.8, textTransform: 'uppercase', color: colors.outline,
  },
  tabLabelActive: { color: colors.primary },

  // ── Desktop two-column layout ────────────────────────────────────────────
  deskShell: {
    flex: 1, flexDirection: 'row',
  },

  // Left rail
  deskRail: {
    width: 260,
    backgroundColor: colors.surfaceContainerLowest,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.outlineVariant,
    flexDirection: 'column',
  },
  deskHeader: {
    paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  deskBackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingBottom: 12,
  },
  deskBackLabel: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, letterSpacing: 0.3,
  },
  deskIdentityRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, gap: 10,
  },
  deskPortrait: {
    width: 48, height: 48, borderRadius: 24, flexShrink: 0,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  deskPortraitImg: { width: 48, height: 48, borderRadius: 24 },
  deskNameBlock: { flex: 1, minWidth: 0, paddingTop: 2 },
  deskName: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface, letterSpacing: -0.2, lineHeight: 18,
  },
  deskNameInput: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.primary, borderBottomWidth: 1, borderBottomColor: colors.primary,
    paddingVertical: 1,
  },
  deskSub: {
    fontSize: 11, fontFamily: fonts.label, color: colors.outline,
    marginTop: 2, textTransform: 'capitalize',
  },
  deskLevel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, marginTop: 2, letterSpacing: 0.3,
  },
  deskHeaderIcons: {
    flexDirection: 'column', gap: 6, paddingTop: 2,
  },
  deskIconBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  deskIconBtnActive: { borderColor: colors.gm, backgroundColor: colors.gmContainer },

  // Stats block
  deskStats: {
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
    gap: 4,
  },
  deskHpBox: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    paddingBottom: 12,
    gap: 6,
  },
  deskHpSectionLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  deskHpRow: { gap: 6 },
  deskHpNums: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  deskHpCenterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  deskHpNumsCenter: {
    flexDirection: 'row', alignItems: 'baseline', gap: 2, paddingHorizontal: 10, paddingVertical: 4,
  },
  deskHpActionBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  deskHpCurrent: {
    fontSize: 28, fontFamily: fonts.headline, fontWeight: '800', lineHeight: 30,
  },
  deskHpSep: { fontSize: 14, color: colors.outline, marginHorizontal: 2 },
  deskHpMax: { fontSize: 14, fontFamily: fonts.headline, fontWeight: '600', color: colors.outline },
  deskHpTemp: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: '#3B82F6', marginLeft: 4 },
  deskHpTrack: {
    height: 5, borderRadius: 3,
    backgroundColor: colors.outlineVariant, flexDirection: 'row', overflow: 'hidden',
  },
  deskHpFill: { height: '100%', borderRadius: 3 },
  deskHpTempFill: { height: '100%', backgroundColor: '#3B82F6' },
  deskHpMeta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  deskHpTempLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: '#3B82F6',
  },
  deskHpInspired: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  deskHpInspiredLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.gm,
  },
  // Inline death saves (shown below HP when hpCurrent === 0)
  deskDeathBox: {
    paddingVertical: 8, gap: 5,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  deskDeathLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline,
  },
  deskDeathPipRows: { gap: 5 },
  deskDeathPipRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  deskDeathPipLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '800', letterSpacing: 1, width: 10,
  },
  deskDeathPip: {
    width: 13, height: 13, borderRadius: 7,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  deskDeathPipSuccess: { backgroundColor: colors.hpHealthy, borderColor: colors.hpHealthy },
  deskDeathPipFailure: { backgroundColor: colors.hpDanger, borderColor: colors.hpDanger },

  deskStatGrid: { gap: 6 },
  deskConditions: { gap: 6, marginBottom: 10 },
  deskStatRow: { flexDirection: 'row', gap: 6 },

  // Horizontal tab bar (top of right pane)
  deskTabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  deskTabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 22, paddingVertical: 18,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  deskTabBtnActive: {
    borderBottomColor: colors.primary,
  },
  deskTabLabel: {
    fontSize: 14, fontFamily: fonts.body, fontWeight: '600',
    color: colors.outline,
  },
  deskTabLabelActive: { color: colors.primary },

  // Right content pane
  deskContent: {
    flex: 1,
    backgroundColor: colors.surfaceCanvas,
  },
  deskPanes: { flex: 1, flexDirection: 'row' },
  deskPaneDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.outlineVariant,
  },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  backText: { color: colors.brand, fontSize: 14 },
  settingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  settingsBtnText: {
    fontSize: 13, color: colors.textSecondary,
  },

  // Hero
  heroCard: {
    ...CARD,
    marginBottom: spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  heroLeft: { position: 'relative' },
  heroRightGrid: {
    marginLeft: 'auto',
    flexDirection: 'row', gap: 8,
  },
  heroRightBox: {
    backgroundColor: colors.background, borderRadius: 8,
    paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
  },
  heroRightValue: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
  },
  heroRightLabel: {
    fontSize: 9, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1,
  },
  heroXpRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  heroXpAdd: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 1, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroNameInput: {
    fontSize: 22,
    fontFamily: fonts.display,
    color: colors.textPrimary,
    borderBottomColor: colors.brand,
    borderBottomWidth: 1,
    paddingVertical: 2,
    marginBottom: 2,
  },
  manualBadge: {
    backgroundColor: colors.hpWarning + '22',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  manualBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.hpWarning,
  },
  heroAvatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.background,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  heroAvatarImage: {
    width: 64, height: 64, borderRadius: 32,
  },
  heroAvatarEditIcon: {
    position: 'absolute', bottom: 2, right: 2,
  },
  heroBody: { flex: 1 },
  heroName: {
    fontSize: 22, fontFamily: fonts.display, color: colors.textPrimary,
    marginBottom: 2,
  },
  heroSubtitle: {
    fontSize: 15, color: colors.textSecondary, marginBottom: spacing.sm,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  levelBadge: {
    backgroundColor: colors.brand + '22', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  levelText: { fontSize: 12, fontWeight: '700', color: colors.brand },
  heroDetail: { fontSize: 12, color: colors.textSecondary },

  // Grid
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md,
  },
  dragHandle: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.background, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  dragHandleLabel: {
    fontSize: 11, color: colors.textSecondary, fontStyle: 'italic',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  dragArrow: {
    padding: 2,
  },

  fourColRow: {
    flexDirection: 'row', gap: spacing.md, width: '100%',
  },
  // Generic card
  card: { ...CARD, minWidth: 200, flex: 1, flexBasis: 200 },
  cardWide: { flexBasis: '100%' },
  profTrainingGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, marginTop: spacing.xs,
  },
  profTrainingCol: {
    flex: 1, minWidth: 140,
  },
  profTrainingHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: spacing.xs,
    paddingBottom: 4, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  profTrainingLabel: {
    fontSize: 11, fontWeight: '700', color: colors.brand,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  profTrainingItem: {
    fontSize: 13, color: colors.textPrimary, paddingVertical: 2,
  },
  profTrainingEmpty: {
    fontSize: 12, color: colors.textSecondary, fontStyle: 'italic',
  },
  attunementSlot: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  attunementItemName: { fontSize: 13, color: colors.textPrimary },
  attunementEmpty: { fontSize: 12, color: colors.border, fontStyle: 'italic' },
  eqToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 10, borderBottomColor: colors.border, borderBottomWidth: 1,
    marginBottom: spacing.sm,
  },
  eqToggleText: { fontSize: 14, color: colors.textPrimary },
  coinRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm,
  },
  coinCell: {
    flex: 1, alignItems: 'center',
  },
  coinArrow: {
    padding: 2,
  },
  coinValueBox: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    width: '100%', paddingVertical: 8, alignItems: 'center',
  },
  coinValue: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
  },
  coinLabel: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },
  scratchpadInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8, color: colors.textPrimary,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    minHeight: 120, lineHeight: 20,
  },
  cardLabel: {
    fontSize: 11, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
  },

  // HP card
  hpCard: {
    ...CARD, minWidth: 200, flex: 1, flexBasis: 200, alignItems: 'center',
  },
  hpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  hpBox: {
    borderWidth: 2, borderRadius: 10,
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 2,
  },
  hpTempInline: {
    fontSize: 20, fontWeight: '700', color: '#3B82F6', marginLeft: 2,
  },
  hpValue: { fontSize: 40, fontWeight: '700', lineHeight: 44 },
  hpSep: { fontSize: 20, color: colors.textSecondary, marginHorizontal: 6 },
  hpMax: { fontSize: 20, color: colors.textSecondary },
  hpBarTrack: {
    width: '100%', height: 10, backgroundColor: colors.border,
    borderRadius: 5, marginTop: spacing.sm, overflow: 'hidden',
    flexDirection: 'row',
  },
  hpBarFill: { height: 10, borderRadius: 5 },
  hpBarTemp: { height: 10, backgroundColor: '#3B82F6' },
  hpQuickBtn: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    borderColor: colors.border,
  },
  hpQuickBtnLeft: { marginRight: 'auto' },
  tapHint: { fontSize: 12, color: colors.brand, marginTop: spacing.sm, fontWeight: '600' },

  // Quick HP modal
  quickHpHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md,
  },
  healBtnRow: {
    flexDirection: 'row', gap: spacing.sm,
  },
  healBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 12, alignItems: 'center',
  },
  quickHpInput: {
    backgroundColor: colors.background, borderWidth: 2,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 28, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', marginBottom: spacing.md,
  },


  // Combat stats (inside HP card)
  combatDivider: {
    height: 1, backgroundColor: colors.border,
    marginVertical: spacing.md, width: '100%',
  },
  combatGrid: {
    flexDirection: 'row', gap: spacing.sm, width: '100%',
    marginTop: spacing.sm,
  },
  combatStat: {
    alignItems: 'center', justifyContent: 'center', flex: 1,
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    position: 'relative', overflow: 'hidden', gap: 4,
  },
  combatBgIcon: {
    position: 'absolute',
  },
  shieldToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: spacing.sm, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: colors.border,
  },
  shieldToggleActive: {
    borderColor: colors.brand, backgroundColor: colors.brand + '22',
  },
  shieldToggleText: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
  },
  combatValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  combatLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
  },

  // Ability scores
  movGrid: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm,
  },
  movStat: {
    flex: 1, backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  abilityQuickStats: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg,
  },
  abilityQuickStat: {
    flex: 1, backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, alignItems: 'center',
  },
  abilityQuickValue: {
    fontSize: 28, fontWeight: '700', color: colors.textPrimary,
  },
  abilityQuickLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4,
    textAlign: 'center', lineHeight: 16,
  },
  abilityHeaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingBottom: 6,
    borderBottomColor: colors.border, borderBottomWidth: 1, marginBottom: 0,
  },
  abilityHeaderText: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  abilityRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  abilityLabel: {
    fontSize: 13, fontWeight: '700', color: colors.textSecondary, width: 36,
  },
  abilityScore: {
    fontSize: 17, fontWeight: '700', color: colors.brand, width: 32, textAlign: 'center',
  },
  abilityModCol: {
    fontSize: 14, fontWeight: '600', color: colors.textPrimary,
    width: 36, textAlign: 'center',
  },
  abilityBody: {
    position: 'relative',
  },
  saveSpacer: { flex: 1 },
  saveCell: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: 54, gap: 6,
  },
  saveModText: {
    fontSize: 14, fontWeight: '700', color: colors.textPrimary,
  },
  profDotSmall: {
    width: 7, height: 7, borderRadius: 4,
    borderWidth: 1, borderColor: colors.border,
  },

  // Skills / saves
  skillRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  profDot: {
    width: 8, height: 8, borderRadius: 4,
    borderWidth: 1, borderColor: colors.border, marginRight: 8,
  },
  profDotFilled: { backgroundColor: colors.brand, borderColor: colors.brand },
  skillName: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  skillAbility: { fontSize: 11, color: colors.textSecondary, marginRight: 8 },
  skillModText: {
    fontSize: 13, fontWeight: '700', color: colors.textPrimary,
    minWidth: 28, textAlign: 'right',
  },

  // Death saves
  deathSavesRow: { flexDirection: 'row', gap: 24, justifyContent: 'center' },
  deathSaveSide: { alignItems: 'center', gap: 8 },
  deathSaveLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  savePips: { flexDirection: 'row', gap: 8 },
  savePip: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
  },
  savePipSuccess: { backgroundColor: colors.hpHealthy, borderColor: colors.hpHealthy },
  savePipFailure: { backgroundColor: colors.hpDanger, borderColor: colors.hpDanger },
  stabilizedHint: { fontSize: 12, textAlign: 'center', marginTop: 10, color: colors.hpHealthy },

  concentrationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6,
  },
  concentrationSpell: {
    flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary,
  },
  concentrationClearBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  concentrationClearText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  concentrationSetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6,
    alignSelf: 'flex-start',
  },
  concentrationSetText: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic' },


  // Level grid
  lvlGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  lvlXpBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  lvlSection: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    flexShrink: 0,
  },
  lvlLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  lvlValue: {
    fontSize: 20, fontWeight: '700', color: colors.textPrimary,
  },
  lvlDivider: {
    width: 1, height: 24, backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  xpSection: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1,
  },
  xpValue: {
    fontSize: 20, fontWeight: '700', color: colors.textPrimary, flexShrink: 1,
  },
  xpAddBtn: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  lvlStat: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background, borderRadius: 10,
    paddingVertical: spacing.lg, position: 'relative', overflow: 'hidden',
    flex: 1, minWidth: '45%',
  },

  // Attack table
  atkTableHeader: {
    flexDirection: 'row', borderBottomColor: colors.border, borderBottomWidth: 1,
    paddingBottom: 6, marginBottom: 2,
  },
  atkHeaderText: {
    fontSize: 10, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  atkTableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  atkCellName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  atkCellText: { fontSize: 13, color: colors.textPrimary },
  atkCellNotes: { fontSize: 11, color: colors.textSecondary },

  // Equipment
  equipHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  equipEmpty: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.sm },
  equipSubLabel: {
    fontSize: 10, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: spacing.xs, marginBottom: 4,
  },
  equipRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  equipRowDim: { opacity: 0.45 },
  equipToggle: { marginRight: spacing.sm },
  equipInfo: { flex: 1 },
  equipName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  equipDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  equipProps: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' },

  // Equipment modal
  eqLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  eqInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: colors.textPrimary, fontSize: 15,
  },
  eqSlotRow: { flexDirection: 'row', gap: spacing.sm },
  eqSlotBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  eqSlotBtnActive: {
    borderColor: colors.brand, backgroundColor: colors.brand + '22',
  },
  eqSlotText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  eqSlotTextActive: { color: colors.brand },
  eqDeleteBtn: {
    alignItems: 'center', paddingVertical: spacing.md,
  },
  eqDeleteText: { fontSize: 14, color: colors.hpDanger, fontWeight: '600' },

  // Features
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1,
  },
  featureInfo: { flex: 1 },
  featureName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  featureDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  featureUses: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: spacing.sm,
  },
  featureUsesText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, minWidth: 28, textAlign: 'center' },

  // Attribution
  attribution: {
    fontSize: 11, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 16, marginTop: spacing.md,
  },

  // Modals
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalCard: {
    backgroundColor: colors.surface, borderRadius: 14,
    borderColor: colors.border, borderWidth: 1,
    width: '90%', maxWidth: 400, padding: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '700', color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // Activity log
  logList: { maxHeight: 360 },
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  logLabel: {
    fontSize: 13, fontWeight: '600', color: colors.textPrimary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  logDice: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  logTotal: { fontSize: 20, fontWeight: '800' },
  logEmpty: {
    fontSize: 13, color: colors.textSecondary, fontStyle: 'italic',
    paddingVertical: spacing.md,
  },

  // Settings
  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
  },
  settingLabel: {
    fontSize: 15, fontWeight: '600', color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13, color: colors.textSecondary, lineHeight: 18,
  },

  // Field edit
  hpEditRow: {
    flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md,
  },
  hpEditField: { flex: 1 },
  hpEditLabel: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs,
  },
  fieldInput: {
    backgroundColor: colors.background, borderColor: colors.border,
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 24, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', marginBottom: spacing.md,
  },
  fieldSaveBtn: {
    backgroundColor: colors.brand, borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  fieldSaveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // ── Left rail: ability scores + saves (Option C combined rows) ──────────
  deskSection: {
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  deskSectionLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', color: colors.outline, marginBottom: 4,
  },
  deskAbilityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 0,
    paddingVertical: 3, paddingHorizontal: 4,
    borderRadius: 6,
  },
  deskAbilDot: {
    width: 7, height: 7, borderRadius: 4,
    borderWidth: 1.5, borderColor: colors.outline,
    flexShrink: 0, marginRight: 7,
  },
  deskAbilDotProf: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  deskAbilName: {
    flex: 1, fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant,
  },
  deskAbilBadge: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: 5, paddingVertical: 2, paddingHorizontal: 7,
    alignItems: 'center', minWidth: 40, marginRight: 4,
  },
  deskAbilBadgeHot: { borderColor: colors.primaryContainer },
  deskAbilMod: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface, lineHeight: 16,
  },
  deskAbilRaw: {
    fontSize: 9, color: colors.outline,
  },
  deskAbilSep: {
    width: 1, height: 22,
    backgroundColor: colors.outlineVariant,
    marginHorizontal: 8,
  },
  deskAbilSaveArea: {
    alignItems: 'flex-end', minWidth: 28,
  },
  deskAbilSaveVal: {
    fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface, lineHeight: 16,
  },
  deskAbilSaveLbl: {
    fontSize: 9, color: colors.outline,
  },

  // ── Left rail: campaign link ─────────────────────────────────────────────
  deskCampSection: {
    padding: 10,
  },
  deskCampCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primaryContainer,
    borderWidth: 1, borderColor: colors.primary,
    borderRadius: radius.lg, padding: 9,
  },
  deskCampCardLbl: {
    fontSize: 7, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
  },
  deskCampCardName: {
    fontSize: 10, fontFamily: fonts.headline, fontWeight: '700', color: colors.primary,
    marginTop: 1,
  },

  // ── Right skills rail ────────────────────────────────────────────────────
  skillsRail: {
    width: 200, flexShrink: 0,
    backgroundColor: colors.surfaceContainerLowest,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.outlineVariant,
    flexDirection: 'column',
  },
  skillsRailHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 10, paddingBottom: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  skillsRailTitle: {
    fontSize: 10, fontFamily: fonts.headline, fontWeight: '800', color: colors.onSurface,
  },
  skillsRailSub: {
    fontSize: 8, fontFamily: fonts.label, color: colors.outline, marginTop: 1,
  },
  skillsRailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderBottomWidth: 1, borderBottomColor: '#ffffff06',
  },
  skillsRailDot: {
    width: 6, height: 6, borderRadius: 3,
    borderWidth: 1.5, borderColor: colors.outline, flexShrink: 0,
  },
  skillsRailDotProf: { backgroundColor: colors.primary, borderColor: colors.primary },
  skillsRailName: {
    flex: 1, fontSize: 9, fontFamily: fonts.body, color: colors.onSurfaceVariant,
  },
  skillsRailNameProf: { color: colors.onSurface, fontWeight: '600' },
  skillsRailAbi: {
    fontSize: 7, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.outline,
  },
  skillsRailVal: {
    fontSize: 10, fontFamily: fonts.headline, fontWeight: '800',
    color: colors.onSurfaceVariant, minWidth: 24, textAlign: 'right',
  },
  skillsRailValProf: { color: colors.primary },
  logRailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#ffffff06',
  },
  logRailLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase', color: colors.onSurface,
  },
  logRailDice: { fontSize: 8, color: colors.outline, marginTop: 1 },
  logRailTotal: {
    fontSize: 13, fontFamily: fonts.headline, fontWeight: '800',
    minWidth: 24, textAlign: 'right',
  },
  logRailEmpty: {
    fontSize: 10, fontFamily: fonts.body, color: colors.outline, fontStyle: 'italic',
    padding: 10,
  },
  skillsRailCollapsed: {
    width: 28, flexShrink: 0,
    backgroundColor: colors.surfaceContainerLowest,
    borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.outlineVariant,
    alignItems: 'center', paddingTop: 12, gap: 8,
  },
  skillsRailCollapsedLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
    transform: [{ rotate: '90deg' }],
  },
});
