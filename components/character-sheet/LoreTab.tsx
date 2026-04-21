import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type {
  Dnd5eStats, Dnd5eResources, Dnd5ePersonality, Dnd5eAppearance, Dnd5eJournalEntry,
} from '@vaultstone/types';

type SubTab = 'personality' | 'identity' | 'journal';

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  isOwner: boolean;
  onPersonalityChange?: (field: keyof Dnd5ePersonality, value: string) => void;
  onAppearanceChange?: (field: keyof Dnd5eAppearance, value: string) => void;
  onAddJournalEntry?: () => void;
  onEditJournalEntry?: (entry: Dnd5eJournalEntry) => void;
}

export function LoreTab({
  stats, resources, isOwner,
  onPersonalityChange, onAppearanceChange, onAddJournalEntry, onEditJournalEntry,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('personality');
  const personality = resources.personality ?? {};
  const appearance = resources.appearance ?? {};
  const journal = resources.journal ?? [];

  return (
    <View style={s.root}>
      {/* Sub-tab bar */}
      <View style={s.subTabBar}>
        {(['personality', 'identity', 'journal'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.subTabBtn, activeSubTab === tab && s.subTabBtnActive]}
            onPress={() => setActiveSubTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[s.subTabLabel, activeSubTab === tab && s.subTabLabelActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeSubTab === 'personality' && (
        <PersonalityPane
          personality={personality}
          isOwner={isOwner}
          onChange={onPersonalityChange}
        />
      )}
      {activeSubTab === 'identity' && (
        <IdentityPane
          stats={stats}
          appearance={appearance}
          xp={resources.xp}
          isOwner={isOwner}
          onChange={onAppearanceChange}
        />
      )}
      {activeSubTab === 'journal' && (
        <JournalPane
          entries={journal}
          isOwner={isOwner}
          onAdd={onAddJournalEntry}
          onEdit={onEditJournalEntry}
        />
      )}
    </View>
  );
}

// ── Personality pane ─────────────────────────────────────────────────────────

const PERSONALITY_FIELDS: Array<{ key: keyof Dnd5ePersonality; label: string; placeholder: string; tall?: boolean }> = [
  { key: 'traits',   label: 'Personality Traits', placeholder: 'What mannerisms define this character?', tall: true },
  { key: 'ideals',   label: 'Ideals',              placeholder: 'What beliefs drive them?' },
  { key: 'bonds',    label: 'Bonds',               placeholder: 'What ties them to the world?' },
  { key: 'flaws',    label: 'Flaws',               placeholder: 'What weakness or vice haunts them?' },
  { key: 'backstory',label: 'Backstory',            placeholder: 'Where did they come from?', tall: true },
  { key: 'allies',   label: 'Allies & Enemies',    placeholder: 'Friends, rivals, mentors…' },
  { key: 'faction',  label: 'Organization',        placeholder: 'Guild, order, or faction affiliation' },
];

function PersonalityPane({ personality, isOwner, onChange }: {
  personality: Dnd5ePersonality;
  isOwner: boolean;
  onChange?: (field: keyof Dnd5ePersonality, value: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={s.paneContainer} showsVerticalScrollIndicator={false}>
      {PERSONALITY_FIELDS.map((f) => (
        <View key={f.key} style={s.fieldBlock}>
          <Text style={s.fieldLabel}>{f.label.toUpperCase()}</Text>
          <TextInput
            style={[s.fieldInput, f.tall && s.fieldInputTall]}
            value={personality[f.key] ?? ''}
            onChangeText={isOwner ? (v) => onChange?.(f.key, v) : undefined}
            editable={isOwner}
            multiline
            placeholder={isOwner ? f.placeholder : '—'}
            placeholderTextColor={colors.outline}
            textAlignVertical="top"
          />
        </View>
      ))}
      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

// ── Identity pane ────────────────────────────────────────────────────────────

const ALIGNMENT_OPTIONS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];

const APPEARANCE_FIELDS: Array<{ key: keyof Dnd5eAppearance; label: string }> = [
  { key: 'age',    label: 'Age' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'eyes',   label: 'Eyes' },
  { key: 'hair',   label: 'Hair' },
  { key: 'skin',   label: 'Skin' },
];

function IdentityPane({ stats, appearance, xp, isOwner, onChange }: {
  stats: Dnd5eStats;
  appearance: Dnd5eAppearance;
  xp?: number;
  isOwner: boolean;
  onChange?: (field: keyof Dnd5eAppearance, value: string) => void;
}) {
  const [alignOpen, setAlignOpen] = useState(false);

  return (
    <ScrollView contentContainerStyle={s.paneContainer} showsVerticalScrollIndicator={false}>
      {/* Summary rows */}
      <SectionLabel>CHARACTER</SectionLabel>
      <View style={s.identCard}>
        <IdentRow label="Species"    value={stats.speciesKey} />
        <IdentRow label="Class"      value={`${stats.classKey} · Level ${stats.level}`} />
        <IdentRow label="Background" value={stats.backgroundKey} />
        <IdentRow label="Rules"      value={stats.srdVersion === 'SRD_2.0' ? '2024 D&D' : '2014 D&D'} />
        {stats.originFeat ? (
          <IdentRow label="Origin Feat" value={stats.originFeat} accent last />
        ) : (
          <IdentRow label="Origin Feat" value="—" last />
        )}
      </View>

      {/* XP */}
      {xp !== undefined && (
        <>
          <SectionLabel style={{ marginTop: 14 }}>EXPERIENCE</SectionLabel>
          <View style={s.xpCard}>
            <Text style={s.xpValue}>{xp.toLocaleString()}</Text>
            <Text style={s.xpLabel}>XP earned</Text>
          </View>
        </>
      )}

      {/* Alignment */}
      <SectionLabel style={{ marginTop: 14 }}>ALIGNMENT</SectionLabel>
      <TouchableOpacity
        style={s.alignCard}
        onPress={() => isOwner && setAlignOpen(!alignOpen)}
        activeOpacity={isOwner ? 0.7 : 1}
      >
        <Text style={s.alignValue}>{appearance.alignment ?? '—'}</Text>
        {isOwner && (
          <MaterialCommunityIcons
            name="chevron-down"
            size={16}
            color={colors.outline}
            style={{ transform: [{ rotate: alignOpen ? '180deg' : '0deg' }] }}
          />
        )}
      </TouchableOpacity>
      {alignOpen && isOwner && (
        <View style={s.alignOptions}>
          {ALIGNMENT_OPTIONS.map((a) => (
            <TouchableOpacity
              key={a}
              style={[s.alignOption, appearance.alignment === a && s.alignOptionActive]}
              onPress={() => { onChange?.('alignment', a); setAlignOpen(false); }}
              activeOpacity={0.7}
            >
              <Text style={[s.alignOptionText, appearance.alignment === a && s.alignOptionTextActive]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Appearance */}
      <SectionLabel style={{ marginTop: 14 }}>APPEARANCE</SectionLabel>
      <View style={s.appearanceGrid}>
        {APPEARANCE_FIELDS.map((f) => (
          <View key={f.key} style={s.appearField}>
            <Text style={s.appearLabel}>{f.label.toUpperCase()}</Text>
            <TextInput
              style={s.appearInput}
              value={appearance[f.key] ?? ''}
              onChangeText={isOwner ? (v) => onChange?.(f.key, v) : undefined}
              editable={isOwner}
              placeholder="—"
              placeholderTextColor={colors.outline}
            />
          </View>
        ))}
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
  );
}

function IdentRow({ label, value, accent, last }: {
  label: string; value: string; accent?: boolean; last?: boolean;
}) {
  return (
    <View style={[s.identRow, !last && s.identRowBorder]}>
      <Text style={s.identLabel}>{label}</Text>
      <Text style={[s.identValue, accent && { color: '#e6a255' }]}>{value}</Text>
    </View>
  );
}

// ── Journal pane ─────────────────────────────────────────────────────────────

function JournalPane({ entries, isOwner, onAdd, onEdit }: {
  entries: Dnd5eJournalEntry[];
  isOwner: boolean;
  onAdd?: () => void;
  onEdit?: (entry: Dnd5eJournalEntry) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = entries.filter((e) =>
    !search ||
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.body.toLowerCase().includes(search.toLowerCase()) ||
    (e.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <View style={s.journalRoot}>
      {/* Search + add */}
      <View style={s.journalHeader}>
        <View style={s.searchBar}>
          <MaterialCommunityIcons name="magnify" size={16} color={colors.outline} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search entries…"
            placeholderTextColor={colors.outline}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle" size={16} color={colors.outline} />
            </TouchableOpacity>
          )}
        </View>
        {isOwner && (
          <TouchableOpacity style={s.addBtn} onPress={onAdd} activeOpacity={0.7}>
            <MaterialCommunityIcons name="plus" size={16} color={colors.onSurface} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.journalList} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 && (
          <View style={s.emptyState}>
            <MaterialCommunityIcons name="book-open-outline" size={32} color={colors.outlineVariant} />
            <Text style={s.emptyTitle}>{entries.length === 0 ? 'No Entries Yet' : 'No Results'}</Text>
            {entries.length === 0 && isOwner && (
              <Text style={s.emptyBody}>Tap + to write your first journal entry.</Text>
            )}
          </View>
        )}
        {filtered.map((entry) => (
          <TouchableOpacity
            key={entry.id}
            style={s.journalCard}
            onPress={() => onEdit?.(entry)}
            activeOpacity={0.7}
          >
            <View style={s.journalCardHeader}>
              <Text style={s.journalTitle} numberOfLines={1}>{entry.title}</Text>
              {entry.date && <Text style={s.journalDate}>{entry.date}</Text>}
            </View>
            <Text style={s.journalBody} numberOfLines={2}>{entry.body}</Text>
            {(entry.tags ?? []).length > 0 && (
              <View style={s.journalTags}>
                {(entry.tags ?? []).slice(0, 4).map((t) => (
                  <View key={t} style={s.journalTag}>
                    <Text style={s.journalTagText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
          </TouchableOpacity>
        ))}
        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children, style }: { children: string; style?: any }) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={s.sectionLabel}>{children}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // Sub-tab bar
  subTabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  subTabBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  subTabBtnActive: { borderBottomColor: colors.primary },
  subTabLabel: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 0.5, color: colors.outline,
  },
  subTabLabelActive: { color: colors.primary },

  // Pane containers
  paneContainer: { paddingHorizontal: spacing.md, paddingTop: 14 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.outline,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.outlineVariant },

  // Personality fields
  fieldBlock: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.outline, marginBottom: 6,
  },
  fieldInput: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
    minHeight: 44,
  },
  fieldInputTall: { minHeight: 90 },

  // Identity card
  identCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden',
  },
  identRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
  },
  identRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant },
  identLabel: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5, color: colors.outline,
  },
  identValue: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant },

  // XP
  xpCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 14,
    alignItems: 'center', gap: 2,
  },
  xpValue: { fontSize: 28, fontFamily: fonts.headline, fontWeight: '800', color: colors.primary },
  xpLabel: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    letterSpacing: 1, textTransform: 'uppercase', color: colors.outline,
  },

  // Alignment
  alignCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 12,
  },
  alignValue: { fontSize: 14, fontFamily: fonts.body, color: colors.onSurface },
  alignOptions: {
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden', marginTop: 4,
  },
  alignOption: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  alignOptionActive: { backgroundColor: `${colors.primary}18` },
  alignOptionText: { fontSize: 13, fontFamily: fonts.body, color: colors.onSurfaceVariant },
  alignOptionTextActive: { color: colors.primary, fontWeight: '600' },

  // Appearance grid
  appearanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appearField: {
    width: '47%',
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8,
  },
  appearLabel: {
    fontSize: 8, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, color: colors.outline, marginBottom: 4,
  },
  appearInput: {
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurface, padding: 0,
  },

  // Journal
  journalRoot: { flex: 1 },
  journalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingHorizontal: 10, paddingVertical: 7,
  },
  searchInput: {
    flex: 1, fontSize: 13, fontFamily: fonts.body, color: colors.onSurface, padding: 0,
  },
  addBtn: {
    width: 36, height: 36,
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  journalList: { paddingHorizontal: spacing.md, paddingTop: 12 },
  journalCard: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, padding: 14, marginBottom: 10, gap: 6,
  },
  journalCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  journalTitle: {
    flex: 1, fontSize: 14, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface,
  },
  journalDate: {
    fontSize: 10, fontFamily: fonts.label, fontWeight: '600',
    color: colors.outline, marginLeft: 8,
  },
  journalBody: {
    fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 17,
  },
  journalTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  journalTag: {
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 999,
  },
  journalTagText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '600', color: colors.outline },

  // Empty states
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurfaceVariant,
  },
  emptyBody: { fontSize: 13, fontFamily: fonts.body, color: colors.outline, textAlign: 'center' },
});
