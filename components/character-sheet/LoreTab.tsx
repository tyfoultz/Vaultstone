import { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, type NativeSyntheticEvent, type TextInputContentSizeChangeEventData } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type {
  Dnd5eStats, Dnd5eResources, Dnd5ePersonality, Dnd5eAppearance, Dnd5eJournalEntry,
} from '@vaultstone/types';
import { BodyEditor } from '../world/BodyEditor';

type SubTab = 'about' | 'journal';

function ExpandableInput(props: React.ComponentProps<typeof TextInput> & { minH?: number }) {
  const { minH = 44, style, ...rest } = props;
  const [height, setHeight] = useState(minH);
  const onSize = useCallback(
    (e: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      setHeight(Math.max(minH, e.nativeEvent.contentSize.height + 20));
    },
    [minH],
  );
  return (
    <TextInput
      {...rest}
      multiline
      style={[style, { height: Math.max(minH, height) }]}
      onContentSizeChange={onSize}
      textAlignVertical="top"
    />
  );
}

/**
 * Strip the imported-content prefix and SRD edition suffix from a
 * raw content key, then title-case the remainder.
 *
 *   imported_dnd5e_2014_species_phb_dwarf → "Dwarf"
 *   wizard-srd-2-0 → "Wizard"
 *   half-elf → "Half Elf"
 *
 * Returns null for `homebrew_<uuid>` keys — those carry no usable signal
 * in the slug, so the caller (CharacterSheet) supplies the resolved name
 * via the `*Label` props instead.
 */
function prettifyKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^homebrew_[0-9a-f-]+$/i.test(key)) return null;
  let s = key;
  const importedMatch = s.match(/^imported_[^_]+_[^_]+_[^_]+_[^_]+_(.+)$/);
  if (importedMatch) s = importedMatch[1];
  s = s.replace(/-srd-[\d-]+$/i, '');
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Convert plaintext to a minimal Tiptap doc — used to hydrate the rich
 * editor with an older journal entry's body string when no `bodyDoc`
 * is stored yet. Blank-line-separated chunks become paragraphs.
 */
function plainTextToDoc(text: string | undefined | null): object | null {
  if (!text) return null;
  const chunks = text.split(/\n{2,}/);
  return {
    type: 'doc',
    content: chunks.length > 0
      ? chunks.map((chunk) => ({
          type: 'paragraph',
          content: chunk ? [{ type: 'text', text: chunk }] : [],
        }))
      : [{ type: 'paragraph' }],
  };
}

interface Props {
  stats: Dnd5eStats;
  resources: Dnd5eResources;
  isOwner: boolean;
  /** Resolved content names from the parent CharacterSheet's
   *  ContentResolver lookup. Override the local slug prettifier so
   *  homebrew species/class/background show their real name instead of
   *  the row UUID. */
  speciesLabel?: string | null;
  classLabel?: string | null;
  backgroundLabel?: string | null;
  onPersonalityChange?: (field: keyof Dnd5ePersonality, value: string) => void;
  onAppearanceChange?: (field: keyof Dnd5eAppearance, value: string) => void;
  /** Persist the full journal array. Called on add, edit, and delete
   *  with the next-state list; the host writes it back to the
   *  character's resources. */
  onUpdateJournal?: (entries: Dnd5eJournalEntry[]) => void;
}

export function LoreTab({
  stats, resources, isOwner,
  speciesLabel, classLabel, backgroundLabel,
  onPersonalityChange, onAppearanceChange, onUpdateJournal,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('journal');
  const personality = resources.personality ?? {};
  const appearance = resources.appearance ?? {};
  const journal = resources.journal ?? [];

  return (
    <View style={s.root}>
      {/* Sub-tab bar — Personality + Identity merged into "About"
          since both surface character-defining context and read as a
          single narrative from identity card → appearance → personality
          fields. Journal stays separate since it's session-by-session
          play log content. */}
      <View style={s.subTabBar}>
        {(['about', 'journal'] as const).map((tab) => (
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

      {activeSubTab === 'about' && (
        <AboutPane
          stats={stats}
          personality={personality}
          appearance={appearance}
          xp={resources.xp}
          isOwner={isOwner}
          speciesLabel={speciesLabel}
          classLabel={classLabel}
          backgroundLabel={backgroundLabel}
          onPersonalityChange={onPersonalityChange}
          onAppearanceChange={onAppearanceChange}
        />
      )}
      {activeSubTab === 'journal' && (
        <JournalPane
          entries={journal}
          isOwner={isOwner}
          onUpdate={onUpdateJournal}
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
  { key: 'goals',    label: 'Goals',               placeholder: 'Short-term and long-term ambitions…' },
  { key: 'backstory',label: 'Backstory',            placeholder: 'Where did they come from?', tall: true },
  // "Allies, Enemies & Organizations" merges the old separate
  // Organization (faction) field into a single relationships block.
  // Legacy `personality.faction` values still surface on save via
  // the back-compat migration below.
  { key: 'allies',   label: 'Allies, Enemies & Organizations', placeholder: 'Friends, rivals, mentors, guilds, orders…', tall: true },
];

// ── About pane (merged Personality + Identity) ───────────────────────────────

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

/**
 * Merged identity + personality pane. Order top-to-bottom:
 *   Identity card → Experience → Alignment → Deity → Appearance grid
 *     → Clothing & Accessories → Personality fields (Traits, Ideals,
 *     Bonds, Flaws, Backstory, Allies, Organization)
 *
 * Personality keeps its rich multiline inputs; identity keeps its
 * compact summary card. Single scroll, two saved field families.
 */
function AboutPane({
  stats, personality, appearance, xp, isOwner,
  speciesLabel, classLabel, backgroundLabel,
  onPersonalityChange, onAppearanceChange,
}: {
  stats: Dnd5eStats;
  personality: Dnd5ePersonality;
  appearance: Dnd5eAppearance;
  xp?: number;
  isOwner: boolean;
  speciesLabel?: string | null;
  classLabel?: string | null;
  backgroundLabel?: string | null;
  onPersonalityChange?: (field: keyof Dnd5ePersonality, value: string) => void;
  onAppearanceChange?: (field: keyof Dnd5eAppearance, value: string) => void;
}) {
  const [alignOpen, setAlignOpen] = useState(false);

  return (
    <ScrollView contentContainerStyle={s.paneContainer} showsVerticalScrollIndicator={false}>
      {/* Identity card */}
      <SectionLabel>CHARACTER</SectionLabel>
      <View style={s.identCard}>
        <IdentRow label="Species"    value={speciesLabel ?? prettifyKey(stats.speciesKey) ?? '—'} />
        <IdentRow label="Class"      value={`${classLabel ?? prettifyKey(stats.classKey) ?? '—'} · Level ${stats.level}`} />
        <IdentRow label="Background" value={backgroundLabel ?? prettifyKey(stats.backgroundKey) ?? '—'} />
        <IdentRow label="Rules"      value={stats.srdVersion === 'SRD_2.0' ? '2024 D&D' : '2014 D&D'} />
        {stats.originFeat ? (
          <IdentRow label="Origin Feat" value={stats.originFeat} accent last />
        ) : (
          <IdentRow label="Origin Feat" value="—" last />
        )}
      </View>

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
              onPress={() => { onAppearanceChange?.('alignment', a); setAlignOpen(false); }}
              activeOpacity={0.7}
            >
              <Text style={[s.alignOptionText, appearance.alignment === a && s.alignOptionTextActive]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Deity */}
      <SectionLabel style={{ marginTop: 14 }}>DEITY</SectionLabel>
      <View style={s.fieldBlock}>
        <TextInput
          style={s.fieldInput}
          value={appearance.deity ?? ''}
          onChangeText={isOwner ? (v) => onAppearanceChange?.('deity', v) : undefined}
          editable={isOwner}
          placeholder={isOwner ? 'Patron deity, faith, or oath' : '—'}
          placeholderTextColor={colors.outline}
        />
      </View>

      {/* Appearance grid */}
      <SectionLabel style={{ marginTop: 14 }}>APPEARANCE</SectionLabel>
      <View style={s.appearanceGrid}>
        {APPEARANCE_FIELDS.map((f) => (
          <View key={f.key} style={s.appearField}>
            <Text style={s.appearLabel}>{f.label.toUpperCase()}</Text>
            <TextInput
              style={s.appearInput}
              value={appearance[f.key] ?? ''}
              onChangeText={isOwner ? (v) => onAppearanceChange?.(f.key, v) : undefined}
              editable={isOwner}
              placeholder="—"
              placeholderTextColor={colors.outline}
            />
          </View>
        ))}
      </View>

      {/* Clothing & accessories — paragraph-scale freeform. */}
      <SectionLabel style={{ marginTop: 14 }}>CLOTHING & ACCESSORIES</SectionLabel>
      <View style={s.fieldBlock}>
        <ExpandableInput
          minH={90}
          style={s.fieldInput}
          value={appearance.attire ?? ''}
          onChangeText={isOwner ? (v) => onAppearanceChange?.('attire', v) : undefined}
          editable={isOwner}
          placeholder={isOwner ? 'Signet rings, talismans, signature attire…' : '—'}
          placeholderTextColor={colors.outline}
        />
      </View>

      {/* Personality fields — rich multilines, one section per
          PERSONALITY_FIELDS entry so they read as separate beats.
          Back-compat: when rendering Allies, fold the legacy
          `personality.faction` value into the display so old saves
          don't lose their Organization content. The user's first edit
          writes through to `allies` and the legacy slot is cleared. */}
      {PERSONALITY_FIELDS.map((f) => {
        const isAlliesField = f.key === 'allies';
        const legacyFaction = isAlliesField ? (personality.faction ?? '').trim() : '';
        const stored = personality[f.key] ?? '';
        const displayValue = isAlliesField && !stored && legacyFaction
          ? legacyFaction
          : isAlliesField && stored && legacyFaction
            ? `${stored}\n\n${legacyFaction}`
            : stored;
        return (
          <View key={f.key}>
            <SectionLabel style={{ marginTop: 14 }}>{f.label.toUpperCase()}</SectionLabel>
            <View style={s.fieldBlock}>
              <ExpandableInput
                minH={f.tall ? 90 : 44}
                style={s.fieldInput}
                value={displayValue}
                onChangeText={isOwner ? (v) => {
                  onPersonalityChange?.(f.key, v);
                  if (isAlliesField && legacyFaction) {
                    onPersonalityChange?.('faction', '');
                  }
                } : undefined}
                editable={isOwner}
                placeholder={isOwner ? f.placeholder : '—'}
                placeholderTextColor={colors.outline}
              />
            </View>
          </View>
        );
      })}

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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Two-pane journal: list on the left (search + entries), inline
 * editor on the right for the selected entry. All edits live-write
 * through `onUpdate` — there's no separate save step. Delete keeps
 * a two-step confirm since it's destructive.
 */
function JournalPane({ entries, isOwner, onUpdate }: {
  entries: Dnd5eJournalEntry[];
  isOwner: boolean;
  onUpdate?: (entries: Dnd5eJournalEntry[]) => void;
}) {
  // Measure the actual pane width — not window width — so the layout
  // adapts when Lore is rendered inside a narrow split-tab pane
  // (~450-580px). Window-based detection picked the two-column layout
  // for any window >= 768px, leaving the editor with ~300px to write in.
  // Below this threshold (sidebar 280 + editor 480) we switch to the
  // mobile dropdown-picker pattern so the editor gets the full width.
  const [paneWidth, setPaneWidth] = useState<number | null>(null);
  const isDesktop = paneWidth === null ? true : paneWidth >= 760;
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(
    entries.length > 0 ? entries[0].id : null,
  );
  // Used by the narrow-pane (dropdown) layout — controls the picker
  // popover's open/closed state.
  const [pickerOpen, setPickerOpen] = useState(false);

  const filtered = entries.filter((e) =>
    !search ||
    e.title.toLowerCase().includes(search.toLowerCase()) ||
    e.body.toLowerCase().includes(search.toLowerCase()) ||
    (e.tags ?? []).some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  function openNew() {
    if (!onUpdate) return;
    const id = `j_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const fresh: Dnd5eJournalEntry = {
      id, title: '', body: '', date: todayISO(), tags: [],
    };
    onUpdate([fresh, ...entries]);
    setSelectedId(id);
  }

  function patchEntry(id: string, patch: Partial<Dnd5eJournalEntry>) {
    if (!onUpdate) return;
    onUpdate(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteEntry(id: string) {
    if (!onUpdate) return;
    const next = entries.filter((e) => e.id !== id);
    onUpdate(next);
    // Move selection to the next available entry (or clear it).
    setSelectedId(next.length > 0 ? next[0].id : null);
  }

  const editorPane = (
    <View style={s.journalEditorPane}>
      {selected ? (
        <JournalEntryEditor
          key={selected.id}
          entry={selected}
          isOwner={isOwner}
          onPatch={(patch) => patchEntry(selected.id, patch)}
          onDelete={isOwner ? () => deleteEntry(selected.id) : undefined}
        />
      ) : (
        <View style={s.journalEmptyEditor}>
          <MaterialCommunityIcons name="notebook-outline" size={36} color={colors.outlineVariant} />
          <Text style={s.emptyTitle}>
            {entries.length === 0 ? 'No entries yet' : 'Select an entry'}
          </Text>
          {entries.length === 0 && isOwner ? (
            <Text style={s.emptyBody}>Tap + to start writing.</Text>
          ) : null}
        </View>
      )}
    </View>
  );

  if (isDesktop) {
    return (
      <View style={s.journalRoot} onLayout={(e) => setPaneWidth(e.nativeEvent.layout.width)}>
        {/* Left: search + entry list */}
        <View style={s.journalSidebar}>
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
              <TouchableOpacity style={s.addBtn} onPress={openNew} activeOpacity={0.7}>
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
            {filtered.map((entry) => {
              const isSelected = entry.id === selectedId;
              const displayTitle = entry.title.trim() || 'Untitled entry';
              return (
                <TouchableOpacity
                  key={entry.id}
                  style={[s.journalCard, isSelected && s.journalCardSelected]}
                  onPress={() => setSelectedId(entry.id)}
                  activeOpacity={0.7}
                >
                  <View style={s.journalCardHeader}>
                    <Text
                      style={[s.journalTitle, !entry.title.trim() && { color: colors.outline, fontStyle: 'italic' }]}
                      numberOfLines={1}
                    >
                      {displayTitle}
                    </Text>
                    {entry.date && <Text style={s.journalDate}>{entry.date}</Text>}
                  </View>
                  {entry.body ? (
                    <Text style={s.journalBody} numberOfLines={2}>{entry.body}</Text>
                  ) : null}
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
              );
            })}
            <View style={{ height: 16 }} />
          </ScrollView>
        </View>

        {editorPane}
      </View>
    );
  }

  // ── Mobile: dropdown picker + editor stacked below ──────────────────────────
  const selectedLabel = selected
    ? (selected.title.trim() || 'Untitled entry')
    : entries.length === 0 ? 'No entries yet' : 'Select an entry';

  return (
    <View style={s.journalRootMobile} onLayout={(e) => setPaneWidth(e.nativeEvent.layout.width)}>
      {/* Picker header — current entry on the left, + on the right.
          Tapping the picker opens an inline dropdown of all entries. */}
      <View style={s.journalMobileHeaderRow}>
        <TouchableOpacity
          style={[s.journalPicker, pickerOpen && s.journalPickerOpen]}
          onPress={() => setPickerOpen((v) => !v)}
          activeOpacity={0.7}
          disabled={entries.length === 0}
        >
          <Text
            style={[
              s.journalPickerLabel,
              !selected && { color: colors.outline, fontStyle: 'italic' },
            ]}
            numberOfLines={1}
          >
            {selectedLabel}
          </Text>
          {selected?.date ? (
            <Text style={s.journalPickerDate}>{selected.date}</Text>
          ) : null}
          <MaterialCommunityIcons
            name={pickerOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.outline}
          />
        </TouchableOpacity>
        {isOwner && (
          <TouchableOpacity style={s.addBtn} onPress={openNew} activeOpacity={0.7}>
            <MaterialCommunityIcons name="plus" size={16} color={colors.onSurface} />
          </TouchableOpacity>
        )}
      </View>

      {/* Dropdown panel — search + entry options. */}
      {pickerOpen ? (
        <View style={s.journalDropdown}>
          <View style={s.journalDropdownSearch}>
            <MaterialCommunityIcons name="magnify" size={14} color={colors.outline} />
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search entries…"
              placeholderTextColor={colors.outline}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <MaterialCommunityIcons name="close-circle" size={14} color={colors.outline} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <Text style={s.journalDropdownEmpty}>
                {entries.length === 0 ? 'No entries yet.' : 'No matches.'}
              </Text>
            ) : (
              filtered.map((entry) => {
                const isSelected = entry.id === selectedId;
                const displayTitle = entry.title.trim() || 'Untitled entry';
                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={[s.journalDropdownItem, isSelected && s.journalDropdownItemSelected]}
                    onPress={() => {
                      setSelectedId(entry.id);
                      setPickerOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        s.journalDropdownItemTitle,
                        !entry.title.trim() && { color: colors.outline, fontStyle: 'italic' },
                      ]}
                      numberOfLines={1}
                    >
                      {displayTitle}
                    </Text>
                    {entry.date ? (
                      <Text style={s.journalDropdownItemDate}>{entry.date}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}

      {editorPane}
    </View>
  );
}

// ── Journal entry editor (inline, lives in the right pane) ────────────────────

function JournalEntryEditor({ entry, isOwner, onPatch, onDelete }: {
  entry: Dnd5eJournalEntry;
  isOwner: boolean;
  /** Patch is applied to the active entry on every keystroke / change. */
  onPatch: (patch: Partial<Dnd5eJournalEntry>) => void;
  /** When set, the editor renders a Delete button with a two-step
   *  confirm. Pressing through removes the entry. */
  onDelete?: () => void;
}) {
  const [tagDraft, setTagDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyDocRef = useRef<object | null>(entry.bodyDoc ?? null);

  // Reset transient editor state whenever the host swaps in a different
  // entry. The `key={selected.id}` on JournalEntryEditor already gives
  // us a fresh component instance, but this is here for clarity.
  void entry.id;

  function commitTagDraft() {
    const t = tagDraft.trim();
    if (!t) return;
    const existing = entry.tags ?? [];
    if (existing.some((tag) => tag.toLowerCase() === t.toLowerCase())) {
      setTagDraft('');
      return;
    }
    onPatch({ tags: [...existing, t] });
    setTagDraft('');
  }

  function removeTag(tag: string) {
    onPatch({ tags: (entry.tags ?? []).filter((x) => x !== tag) });
  }

  function handleBodyChange(doc: object, text: string) {
    bodyDocRef.current = doc;
    onPatch({ body: text, bodyDoc: doc });
  }

  return (
    <ScrollView contentContainerStyle={s.journalEditorScroll} showsVerticalScrollIndicator={false}>
      {/* Header — title input + delete affordance on the right */}
      <View style={s.journalEditorHeader}>
        <TextInput
          style={s.journalEditorTitle}
          value={entry.title}
          onChangeText={isOwner ? (v) => onPatch({ title: v }) : undefined}
          editable={isOwner}
          placeholder="Untitled entry"
          placeholderTextColor={colors.outline}
        />
        {onDelete ? (
          confirmDelete ? (
            <View style={s.modalConfirmRow}>
              <Text style={s.modalConfirmText}>Delete?</Text>
              <TouchableOpacity
                onPress={() => setConfirmDelete(false)}
                style={s.modalConfirmBtn}
              >
                <Text style={s.modalConfirmCancelText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setConfirmDelete(false); onDelete(); }}
                style={[s.modalConfirmBtn, s.modalConfirmDangerBtn]}
              >
                <Text style={s.modalConfirmDangerText}>Yes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setConfirmDelete(true)}
              style={s.modalDeleteBtn}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={14} color={colors.hpDanger} />
              <Text style={s.modalDeleteBtnText}>Delete</Text>
            </TouchableOpacity>
          )
        ) : null}
      </View>

      {/* Date */}
      <View style={{ marginTop: spacing.sm }}>
        <Text style={s.modalFieldLabel}>DATE</Text>
        <TextInput
          style={s.fieldInput}
          value={entry.date ?? ''}
          onChangeText={isOwner ? (v) => onPatch({ date: v }) : undefined}
          editable={isOwner}
          placeholder="YYYY-MM-DD or in-world date"
          placeholderTextColor={colors.outline}
        />
      </View>

      {/* Body (rich Tiptap editor on web; plain TextInput on native) */}
      <View style={{ marginTop: spacing.sm }}>
        <Text style={s.modalFieldLabel}>ENTRY</Text>
        <BodyEditor
          initialContent={entry.bodyDoc ?? plainTextToDoc(entry.body)}
          onChange={handleBodyChange}
          editable={isOwner}
          placeholder="What happened, what you learned, what to remember…"
        />
      </View>

      {/* Tags */}
      <View style={{ marginTop: spacing.sm }}>
        <Text style={s.modalFieldLabel}>TAGS</Text>
        {(entry.tags ?? []).length > 0 ? (
          <View style={s.modalTagsRow}>
            {(entry.tags ?? []).map((t) => (
              <View key={t} style={s.modalTagChip}>
                <Text style={s.modalTagChipText}>{t}</Text>
                {isOwner ? (
                  <TouchableOpacity
                    onPress={() => removeTag(t)}
                    hitSlop={6}
                  >
                    <MaterialCommunityIcons name="close" size={11} color={colors.outline} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
        {isOwner ? (
          <View style={s.modalTagInputRow}>
            <TextInput
              style={[s.fieldInput, { flex: 1 }]}
              value={tagDraft}
              onChangeText={setTagDraft}
              onSubmitEditing={commitTagDraft}
              placeholder="Add a tag and press Add"
              placeholderTextColor={colors.outline}
              returnKeyType="done"
            />
            <TouchableOpacity
              onPress={commitTagDraft}
              style={s.modalTagAddBtn}
              activeOpacity={0.7}
            >
              <Text style={s.modalTagAddBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
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

  // Journal — two-pane layout on desktop: sidebar list + editor pane.
  // On mobile, the sidebar collapses into a dropdown above the editor
  // (see `journalRootMobile`).
  journalRoot: { flex: 1, flexDirection: 'row' },
  journalRootMobile: { flex: 1 },
  /** Header row that holds the dropdown picker + add button on mobile. */
  journalMobileHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
  },
  /** The dropdown trigger — current entry label, optional date, chevron. */
  journalPicker: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  journalPickerOpen: { borderColor: colors.primary },
  journalPickerLabel: {
    flex: 1, fontSize: 13, fontFamily: fonts.body, fontWeight: '600',
    color: colors.onSurface,
  },
  journalPickerDate: { fontSize: 10, fontFamily: fonts.label, color: colors.outline },
  /** Dropdown panel — sits directly below the header row when open. */
  journalDropdown: {
    marginHorizontal: spacing.md,
    marginTop: 6,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  journalDropdownSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLowest,
  },
  journalDropdownItem: {
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outlineVariant,
    gap: 2,
  },
  journalDropdownItemSelected: { backgroundColor: `${colors.primary}10` },
  journalDropdownItemTitle: {
    fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurface,
  },
  journalDropdownItemDate: { fontSize: 10, fontFamily: fonts.label, color: colors.outline },
  journalDropdownEmpty: {
    fontSize: 12, fontFamily: fonts.body, color: colors.outline,
    fontStyle: 'italic', padding: spacing.md, textAlign: 'center',
  },
  /** Left column — search + entry cards. Fixed width on wide screens
   *  so the editor pane gets the remaining width. */
  journalSidebar: {
    width: 280,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.outlineVariant,
  },
  /** Right column — inline editor for the selected entry. */
  journalEditorPane: { flex: 1, minWidth: 0 },
  /** Placeholder when no entry is selected. */
  journalEmptyEditor: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: spacing.lg,
  },
  /** Editor scroll container — padding mirrors the personality pane. */
  journalEditorScroll: { paddingHorizontal: spacing.md, paddingTop: 14 },
  journalEditorHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  /** Title input renders large at the top of the editor pane. */
  journalEditorTitle: {
    flex: 1,
    fontSize: 18, fontFamily: fonts.headline, fontWeight: '700',
    color: colors.onSurface,
    paddingVertical: 6,
  },
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
  /** Highlighted card when its entry is selected for editing. */
  journalCardSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
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

  // Journal entry editor modal
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 560, maxHeight: '90%',
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.outlineVariant,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 2,
  },
  modalTitle: {
    fontSize: 15, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface,
  },
  modalFieldLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.4, textTransform: 'uppercase', color: colors.outline,
    marginBottom: 4,
  },

  // Modal: tags
  modalTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  modalTagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  modalTagChipText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '600', color: colors.onSurface },
  modalTagInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTagAddBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  modalTagAddBtnText: { fontSize: 12, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurface },

  // Modal: footer (delete on left, save on right)
  modalFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  modalDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: `${colors.hpDanger}44`,
    backgroundColor: 'transparent',
  },
  modalDeleteBtnText: {
    fontSize: 12, fontFamily: fonts.label, fontWeight: '700', color: colors.hpDanger,
  },
  modalConfirmRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  modalConfirmText: {
    fontSize: 11, fontFamily: fonts.label, fontWeight: '700',
    color: colors.hpDanger, marginRight: 2,
  },
  modalConfirmBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  modalConfirmDangerBtn: {
    backgroundColor: colors.hpDanger,
    borderColor: colors.hpDanger,
  },
  modalConfirmCancelText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },
  modalConfirmDangerText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: '#fff' },

  modalSaveBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryContainer,
  },
  modalSaveBtnDisabled: { opacity: 0.4 },
  modalSaveBtnText: { fontSize: 13, fontFamily: fonts.label, fontWeight: '700', color: colors.onPrimary },
  modalSaveBtnTextDisabled: { color: colors.outline },
});
