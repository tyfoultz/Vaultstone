import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Modal, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '@vaultstone/ui';
import type { Dnd5eAbility, Dnd5eResources, ClassResult, SubclassResult, SpeciesResult } from '@vaultstone/types';

interface Props {
  resources: Dnd5eResources;
  isOwner: boolean;
  classResultsByKey: Record<string, ClassResult>;
  subclassResultsByKey: Record<string, SubclassResult>;
  speciesResult: SpeciesResult | null;
  characterLevel: number;
  onUpdateAbilities: (abilities: Dnd5eAbility[]) => void;
  /** When true, render the tab body inside a View instead of its own
   *  ScrollView so it can be embedded as a section of a larger tab
   *  (e.g. nested inside the Combat tab's scroll). The outer parent
   *  is then responsible for scrolling. */
  embedded?: boolean;
  /** When true (typically together with `embedded`), suppress the
   *  internal "ABILITIES" SectionLabel because the host is already
   *  providing the section title (e.g. a CardBlock wrapper). The rest
   *  buttons still render, right-aligned. */
  headerless?: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  action: 'Action',
  bonus: 'Bonus Action',
  reaction: 'Reaction',
  free: 'Free',
  passive: 'Passive',
};

const RECHARGE_LABELS: Record<string, string> = {
  short: 'Short Rest',
  long: 'Long Rest',
  dawn: 'Dawn',
};

type ImportableFeature = {
  name: string;
  description: string;
  source: string;
  level?: number;
};

export function AbilitiesCardTab({
  resources, isOwner, classResultsByKey, subclassResultsByKey, speciesResult,
  characterLevel, onUpdateAbilities, embedded, headerless,
}: Props) {
  const abilities = resources.abilities ?? [];
  const [editModal, setEditModal] = useState(false);
  const [editAbility, setEditAbility] = useState<Dnd5eAbility | null>(null);
  const [importModal, setImportModal] = useState(false);

  const importableFeatures = useMemo(() => {
    const features: ImportableFeature[] = [];
    const existingNames = new Set(abilities.map((a) => a.name.toLowerCase()));

    for (const cls of Object.values(classResultsByKey)) {
      for (const f of cls.features ?? []) {
        if (f.level <= characterLevel && !existingNames.has(f.name.toLowerCase())) {
          features.push({ name: f.name, description: f.description ?? '', source: `${cls.name} L${f.level}`, level: f.level });
        }
      }
    }
    for (const sc of Object.values(subclassResultsByKey)) {
      for (const f of sc.features ?? []) {
        if (f.level <= characterLevel && !existingNames.has(f.name.toLowerCase())) {
          features.push({ name: f.name, description: f.description, source: `${sc.name} L${f.level}`, level: f.level });
        }
      }
    }
    if (speciesResult) {
      for (const t of speciesResult.traits ?? []) {
        if (!existingNames.has(t.name.toLowerCase())) {
          features.push({ name: t.name, description: t.description, source: speciesResult.name });
        }
      }
    }
    return features;
  }, [classResultsByKey, subclassResultsByKey, speciesResult, characterLevel, abilities]);

  function handleUse(id: string, delta: number) {
    const updated = abilities.map((a) => {
      if (a.id !== id || !a.uses) return a;
      const next = Math.max(0, Math.min(a.uses.max, a.uses.current + delta));
      return { ...a, uses: { ...a.uses, current: next } };
    });
    onUpdateAbilities(updated);
  }

  function handleSave(ability: Dnd5eAbility) {
    const exists = abilities.some((a) => a.id === ability.id);
    const updated = exists
      ? abilities.map((a) => (a.id === ability.id ? ability : a))
      : [...abilities, ability];
    onUpdateAbilities(updated);
    setEditModal(false);
    setEditAbility(null);
  }

  function handleDelete(id: string) {
    onUpdateAbilities(abilities.filter((a) => a.id !== id));
    setEditModal(false);
    setEditAbility(null);
  }

  function handleImport(features: ImportableFeature[]) {
    const newAbilities: Dnd5eAbility[] = features.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: f.name,
      description: f.description,
      source: f.source,
      actionType: 'action',
      uses: null,
    }));
    onUpdateAbilities([...abilities, ...newAbilities]);
    setImportModal(false);
  }

  const Outer = embedded ? View : ScrollView;
  const outerProps = embedded
    ? {} // host owns padding (e.g. the CombatTab CardBlock body)
    : { contentContainerStyle: s.container, showsVerticalScrollIndicator: false };

  // Rest buttons live here ONLY when we're rendering our own section
  // header. The desktop CombatTab uses `headerless` because the host
  // CardBlock + the character sheet's sidebar both already expose Rest
  // — duplicating the buttons here was the playtest "extra rest
  // buttons" complaint. Mobile keeps them: it has no sidebar.
  function handleReorder(id: string, direction: -1 | 1) {
    const i = abilities.findIndex((a) => a.id === id);
    if (i < 0) return;
    const j = i + direction;
    if (j < 0 || j >= abilities.length) return;
    const next = abilities.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onUpdateAbilities(next);
  }

  function handleRestoreAll(rechargeType: 'short' | 'long') {
    const updated = abilities.map((a) => {
      if (!a.uses) return a;
      if (rechargeType === 'short' && a.uses.recharge === 'short') {
        return { ...a, uses: { ...a.uses, current: a.uses.max } };
      }
      if (rechargeType === 'long') {
        return { ...a, uses: { ...a.uses, current: a.uses.max } };
      }
      return a;
    });
    onUpdateAbilities(updated);
  }
  const restButtons = !headerless && isOwner && abilities.some((a) => a.uses) ? (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <TouchableOpacity style={s.restBtn} onPress={() => handleRestoreAll('short')}>
        <MaterialCommunityIcons name="weather-sunset-up" size={12} color={colors.outline} />
        <Text style={s.restBtnText}>Short Rest</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.restBtn} onPress={() => handleRestoreAll('long')}>
        <MaterialCommunityIcons name="weather-night" size={12} color={colors.outline} />
        <Text style={s.restBtnText}>Long Rest</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <Outer {...outerProps}>
      {!headerless ? (
        <View style={s.headerRow}>
          <SectionLabel>ABILITIES</SectionLabel>
          {restButtons}
        </View>
      ) : null}

      {abilities.length === 0 ? (
        <View style={s.emptyWrap}>
          <MaterialCommunityIcons name="lightning-bolt-outline" size={28} color={colors.outline} />
          <Text style={s.emptyText}>No abilities tracked yet.</Text>
          <Text style={s.emptyHint}>Add class features, racial abilities, or item powers to track uses during play.</Text>
        </View>
      ) : null}

      {abilities.map((ability, idx) => (
        <AbilityCard
          key={ability.id}
          ability={ability}
          isOwner={isOwner}
          onUse={(d) => handleUse(ability.id, d)}
          onEdit={() => { setEditAbility({ ...ability }); setEditModal(true); }}
          canMoveUp={idx > 0}
          canMoveDown={idx < abilities.length - 1}
          onMoveUp={() => handleReorder(ability.id, -1)}
          onMoveDown={() => handleReorder(ability.id, 1)}
        />
      ))}

      {isOwner ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          {importableFeatures.length > 0 ? (
            <TouchableOpacity style={s.importBtn} onPress={() => setImportModal(true)}>
              <MaterialCommunityIcons name="download-outline" size={16} color={colors.secondary} />
              <Text style={s.importBtnText}>Import from class features ({importableFeatures.length})</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => {
              setEditAbility({
                id: Date.now().toString(),
                name: '',
                description: '',
                source: 'Custom',
                actionType: 'action',
                uses: null,
              });
              setEditModal(true);
            }}
          >
            <MaterialCommunityIcons name="plus" size={16} color={colors.primary} />
            <Text style={s.addBtnText}>Add custom ability</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {editModal && editAbility ? (
        <AbilityEditModal
          ability={editAbility}
          isNew={!abilities.some((a) => a.id === editAbility.id)}
          onSave={handleSave}
          onDelete={() => handleDelete(editAbility.id)}
          onClose={() => { setEditModal(false); setEditAbility(null); }}
        />
      ) : null}

      {importModal ? (
        <ImportFeaturesModal
          features={importableFeatures}
          onImport={handleImport}
          onClose={() => setImportModal(false)}
        />
      ) : null}
    </Outer>
  );
}

function ImportFeaturesModal({ features, onImport, onClose }: {
  features: ImportableFeature[];
  onImport: (picked: ImportableFeature[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(features.map((f) => f.name)));
  }

  const picked = features.filter((f) => selected.has(f.name));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable style={[s.modalCard, { maxHeight: '85%' }]} onPress={() => {}}>
          <Text style={s.modalTitle}>Import Class Features</Text>
          <Text style={{ fontSize: 12, fontFamily: fonts.body, color: colors.outline, marginBottom: spacing.sm }}>
            Select features to add to your Abilities tab. You can configure use tracking after importing.
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <TouchableOpacity onPress={selectAll}>
              <Text style={{ fontSize: 12, fontFamily: fonts.label, fontWeight: '700', color: colors.primary }}>Select all</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, fontFamily: fonts.label, fontWeight: '600', color: colors.outline }}>
              {selected.size} selected
            </Text>
          </View>

          <ScrollView style={{ maxHeight: 400 }}>
            {features.map((f) => {
              const isSelected = selected.has(f.name);
              return (
                <TouchableOpacity
                  key={f.name}
                  style={[s.importRow, isSelected && s.importRowSelected]}
                  onPress={() => toggle(f.name)}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons
                    name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    size={18}
                    color={isSelected ? colors.primary : colors.outline}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.importRowName}>{f.name}</Text>
                    <Text style={s.importRowSource}>{f.source}</Text>
                    {f.description ? (
                      <Text style={s.importRowDesc} numberOfLines={2}>{f.description}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={s.modalFooter}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.saveBtn, selected.size === 0 && { opacity: 0.5 }]}
              onPress={() => selected.size > 0 && onImport(picked)}
              disabled={selected.size === 0}
            >
              <Text style={s.saveBtnText}>Import {selected.size > 0 ? `(${selected.size})` : ''}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AbilityCard({ ability, isOwner, onUse, onEdit, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: {
  ability: Dnd5eAbility;
  isOwner: boolean;
  onUse: (delta: number) => void;
  onEdit: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasUses = !!ability.uses;
  return (
    <View style={s.card}>
      <TouchableOpacity style={s.cardHeader} onPress={() => setOpen(!open)} activeOpacity={0.8}>
        <View style={s.cardAccent} />
        <View style={{ flex: 1 }}>
          <Text style={s.cardName}>{ability.name}</Text>
          <View style={s.cardMeta}>
            {ability.actionType ? (
              <Text style={s.cardMetaText}>{ACTION_LABELS[ability.actionType] ?? ability.actionType}</Text>
            ) : null}
            {ability.source ? (
              <Text style={s.cardMetaText}>· {ability.source}</Text>
            ) : null}
            {ability.uses ? (
              <Text style={s.cardMetaText}>· {ability.uses.recharge === 'short' ? 'SR' : ability.uses.recharge === 'long' ? 'LR' : 'Dawn'}</Text>
            ) : null}
          </View>
        </View>
        {hasUses ? (
          <View style={s.usesCompact}>
            <Text style={s.usesCompactText}>{ability.uses!.current}/{ability.uses!.max}</Text>
          </View>
        ) : null}
        <MaterialCommunityIcons
          name={open ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={colors.outline}
        />
      </TouchableOpacity>

      {open ? (
        <View style={s.cardBody}>
          {ability.description ? (
            <Text style={s.cardDesc}>{ability.description}</Text>
          ) : null}

          {hasUses && isOwner ? (
            <View style={s.usesRow}>
              <View style={s.pipsRow}>
                {Array.from({ length: ability.uses!.max }, (_, i) => (
                  <View
                    key={i}
                    style={[s.pip, i < ability.uses!.current && s.pipFilled]}
                  />
                ))}
              </View>
              <View style={s.usesBtns}>
                <TouchableOpacity style={s.usesBtn} onPress={() => onUse(-1)}>
                  <Text style={s.usesBtnText}>Use</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.usesBtn} onPress={() => onUse(1)}>
                  <Text style={s.usesBtnText}>Restore</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {isOwner ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <TouchableOpacity
                  onPress={canMoveUp ? onMoveUp : undefined}
                  disabled={!canMoveUp}
                  hitSlop={6}
                  activeOpacity={canMoveUp ? 0.7 : 1}
                  style={[s.reorderBtn, !canMoveUp && s.reorderBtnDisabled]}
                >
                  <MaterialCommunityIcons name="arrow-up" size={12} color={canMoveUp ? colors.onSurfaceVariant : colors.outline} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={canMoveDown ? onMoveDown : undefined}
                  disabled={!canMoveDown}
                  hitSlop={6}
                  activeOpacity={canMoveDown ? 0.7 : 1}
                  style={[s.reorderBtn, !canMoveDown && s.reorderBtnDisabled]}
                >
                  <MaterialCommunityIcons name="arrow-down" size={12} color={canMoveDown ? colors.onSurfaceVariant : colors.outline} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={s.editRow} onPress={onEdit}>
                <MaterialCommunityIcons name="pencil-outline" size={12} color={colors.outline} />
                <Text style={s.editText}>Edit</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function AbilityEditModal({ ability, isNew, onSave, onDelete, onClose }: {
  ability: Dnd5eAbility;
  isNew: boolean;
  onSave: (a: Dnd5eAbility) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(ability);
  const [hasUses, setHasUses] = useState(!!ability.uses);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalBackdrop} onPress={onClose}>
        <Pressable style={s.modalCard} onPress={() => {}}>
          <ScrollView>
            <Text style={s.modalTitle}>{isNew ? 'Add Ability' : 'Edit Ability'}</Text>

            <Text style={s.label}>Name</Text>
            <TextInput
              style={s.input}
              value={draft.name}
              onChangeText={(t) => setDraft({ ...draft, name: t })}
              placeholder="e.g. Rage"
              placeholderTextColor={colors.outline}
            />

            <Text style={s.label}>Description</Text>
            <TextInput
              style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={draft.description}
              onChangeText={(t) => setDraft({ ...draft, description: t })}
              placeholder="What this ability does…"
              placeholderTextColor={colors.outline}
              multiline
            />

            <Text style={s.label}>Source</Text>
            <TextInput
              style={s.input}
              value={draft.source}
              onChangeText={(t) => setDraft({ ...draft, source: t })}
              placeholder="e.g. Barbarian L1"
              placeholderTextColor={colors.outline}
            />

            <Text style={s.label}>Action Type</Text>
            <View style={s.chipRow}>
              {(['action', 'bonus', 'reaction', 'free', 'passive'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[s.chip, draft.actionType === t && s.chipActive]}
                  onPress={() => setDraft({ ...draft, actionType: t })}
                >
                  <Text style={[s.chipText, draft.actionType === t && s.chipTextActive]}>
                    {ACTION_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.toggleRow}>
              <Text style={s.label}>Track Uses</Text>
              <TouchableOpacity
                style={[s.toggle, hasUses && s.toggleOn]}
                onPress={() => {
                  setHasUses(!hasUses);
                  if (!hasUses) {
                    setDraft({ ...draft, uses: { current: 2, max: 2, recharge: 'long' } });
                  } else {
                    setDraft({ ...draft, uses: null });
                  }
                }}
              >
                <Text style={s.toggleText}>{hasUses ? 'ON' : 'OFF'}</Text>
              </TouchableOpacity>
            </View>

            {hasUses && draft.uses ? (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Max Uses</Text>
                    <TextInput
                      style={s.input}
                      value={String(draft.uses.max)}
                      onChangeText={(t) => {
                        const n = parseInt(t) || 0;
                        setDraft({ ...draft, uses: { ...draft.uses!, max: n, current: Math.min(draft.uses!.current, n) } });
                      }}
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Current</Text>
                    <TextInput
                      style={s.input}
                      value={String(draft.uses.current)}
                      onChangeText={(t) => {
                        const n = parseInt(t) || 0;
                        setDraft({ ...draft, uses: { ...draft.uses!, current: Math.min(n, draft.uses!.max) } });
                      }}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <Text style={s.label}>Recharges On</Text>
                <View style={s.chipRow}>
                  {(['short', 'long', 'dawn'] as const).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[s.chip, draft.uses?.recharge === r && s.chipActive]}
                      onPress={() => setDraft({ ...draft, uses: { ...draft.uses!, recharge: r } })}
                    >
                      <Text style={[s.chipText, draft.uses?.recharge === r && s.chipTextActive]}>
                        {RECHARGE_LABELS[r]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={s.modalFooter}>
              {!isNew ? (
                <TouchableOpacity onPress={onDelete}>
                  <Text style={s.deleteText}>Delete</Text>
                </TouchableOpacity>
              ) : <View />}
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, !draft.name.trim() && { opacity: 0.5 }]}
                  onPress={() => draft.name.trim() && onSave(draft)}
                  disabled={!draft.name.trim()}
                >
                  <Text style={s.saveBtnText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionLabel}>{children}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingTop: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: {
    fontSize: 9, fontFamily: fonts.label, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase', color: colors.primary,
  },
  sectionLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.primary + '44' },

  restBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 100, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  restBtnText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },

  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  emptyText: { fontSize: 14, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  emptyHint: { fontSize: 12, fontFamily: fonts.body, color: colors.outline, textAlign: 'center', paddingHorizontal: spacing.lg },

  card: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  cardAccent: { width: 3, height: 28, borderRadius: 2, backgroundColor: colors.primary },
  cardName: { fontSize: 14, fontFamily: fonts.body, fontWeight: '700', color: colors.onSurface },
  cardMeta: { flexDirection: 'row', gap: 4, marginTop: 2 },
  cardMetaText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '600', color: colors.outline },
  usesCompact: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 100, backgroundColor: colors.primary + '22',
  },
  usesCompactText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.primary },

  cardBody: {
    paddingHorizontal: 16, paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant,
  },
  cardDesc: { fontSize: 12, fontFamily: fonts.body, color: colors.onSurfaceVariant, lineHeight: 18, marginTop: 10 },

  usesRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pipsRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  pip: {
    width: 14, height: 14, borderRadius: 3,
    borderWidth: 1.5, borderColor: colors.outlineVariant,
  },
  pipFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  usesBtns: { flexDirection: 'row', gap: 6 },
  usesBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg,
  },
  usesBtnText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '600', color: colors.onSurfaceVariant },

  editRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '600', color: colors.outline },
  reorderBtn: {
    width: 22, height: 22, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  reorderBtnDisabled: { opacity: 0.4 },

  importBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10,
    borderWidth: 1, borderColor: colors.secondary + '66',
    borderRadius: radius.lg, backgroundColor: colors.secondary + '08',
  },
  importBtnText: { fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.secondary },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary + '66',
    borderRadius: radius.lg, backgroundColor: colors.primary + '08',
  },
  addBtnText: { fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.primary },

  importRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    borderRadius: radius.lg, marginBottom: 2,
  },
  importRowSelected: { backgroundColor: colors.primary + '11' },
  importRowName: { fontSize: 13, fontFamily: fonts.body, fontWeight: '700', color: colors.onSurface },
  importRowSource: { fontSize: 10, fontFamily: fonts.label, fontWeight: '600', color: colors.outline, marginTop: 1 },
  importRowDesc: { fontSize: 11, fontFamily: fonts.body, color: colors.onSurfaceVariant, marginTop: 2, lineHeight: 15 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.md,
  },
  modalCard: {
    width: '100%', maxWidth: 440, maxHeight: '85%',
    backgroundColor: colors.surface, borderRadius: 14, padding: spacing.md,
  },
  modalTitle: { fontSize: 18, fontFamily: fonts.headline, fontWeight: '700', color: colors.onSurface, marginBottom: spacing.md },

  label: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: colors.outline, marginTop: spacing.sm, marginBottom: 4 },
  input: {
    backgroundColor: colors.surfaceContainer, borderWidth: 1, borderColor: colors.outlineVariant,
    borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, fontFamily: fonts.body, color: colors.onSurface,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.outlineVariant, borderRadius: 100,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 11, fontFamily: fonts.label, fontWeight: '700', color: colors.outline },
  chipTextActive: { color: colors.onPrimary },

  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  toggle: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 100, borderWidth: 1, borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
  },
  toggleOn: { backgroundColor: colors.primary + '33', borderColor: colors.primary },
  toggleText: { fontSize: 10, fontFamily: fonts.label, fontWeight: '700', color: colors.onSurfaceVariant },

  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg },
  deleteText: { fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.hpDanger },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  cancelBtnText: { fontSize: 13, fontFamily: fonts.body, fontWeight: '600', color: colors.onSurfaceVariant },
  saveBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: 20, paddingVertical: 8 },
  saveBtnText: { fontSize: 13, fontFamily: fonts.body, fontWeight: '700', color: colors.onPrimary },
});
