import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, TextInput, FlatList, Pressable, Modal, ScrollView,
  StyleSheet, ActivityIndicator, Switch,
} from 'react-native';
import { colors, spacing, radius, Text } from '@vaultstone/ui';
import { ContentResolver } from '@vaultstone/content';
import type { CreatureResult } from '@vaultstone/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  onAddCreatures: (creatures: AddCreatureInput[]) => void;
  system?: string;
};

export type AddCreatureInput = {
  name: string;
  initMod: number;
  hpMax: number;
  ac: number;
  creatureKey: string;
};

function rollHitDice(hitDice: string): number {
  const match = hitDice.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return 0;
  const [, countStr, sizeStr, modStr] = match;
  const count = parseInt(countStr, 10);
  const size = parseInt(sizeStr, 10);
  const mod = modStr ? parseInt(modStr, 10) : 0;
  let total = mod;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * size) + 1;
  }
  return Math.max(1, total);
}

export function CreaturePickerModal({ visible, onClose, onAddCreatures, system }: Props) {
  const [allCreatures, setAllCreatures] = useState<CreatureResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CreatureResult | null>(null);
  const [nameOverride, setNameOverride] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [shouldRollHp, setShouldRollHp] = useState(false);
  const [tab, setTab] = useState<'catalog' | 'custom'>('catalog');

  const [customName, setCustomName] = useState('');
  const [customInitMod, setCustomInitMod] = useState('');
  const [customHp, setCustomHp] = useState('');
  const [customAc, setCustomAc] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    ContentResolver.search({ type: 'monster', system: system ?? 'dnd5e' }).then((results) => {
      setAllCreatures(results as CreatureResult[]);
      setLoading(false);
    });
  }, [visible, system]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 200);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const filtered = useMemo(() => {
    if (!debouncedSearch.trim()) return allCreatures;
    const q = debouncedSearch.toLowerCase();
    return allCreatures.filter((c) => c.name.toLowerCase().includes(q));
  }, [allCreatures, debouncedSearch]);

  const handleSelect = useCallback((creature: CreatureResult) => {
    setSelected(creature);
    setNameOverride(creature.name);
    setQuantity(1);
    setShouldRollHp(false);
  }, []);

  const handleAdd = useCallback(() => {
    if (!selected) return;
    const dexMod = selected.abilityModifiers?.dex ?? 0;
    const inputs: AddCreatureInput[] = [];
    for (let i = 0; i < quantity; i++) {
      const suffix = quantity > 1 ? ` ${i + 1}` : '';
      const hp = shouldRollHp && selected.hitDice
        ? rollHitDice(selected.hitDice)
        : selected.hp;
      inputs.push({
        name: (nameOverride || selected.name) + suffix,
        initMod: dexMod,
        hpMax: hp,
        ac: selected.ac,
        creatureKey: selected.key,
      });
    }
    onAddCreatures(inputs);
    setSelected(null);
    setSearch('');
  }, [selected, quantity, shouldRollHp, nameOverride, onAddCreatures]);

  const handleAddCustom = useCallback(() => {
    const name = customName.trim();
    const initMod = parseInt(customInitMod, 10);
    const hp = parseInt(customHp, 10);
    const ac = parseInt(customAc, 10);
    if (!name || Number.isNaN(initMod) || Number.isNaN(hp) || Number.isNaN(ac)) return;
    onAddCreatures([{ name, initMod, hpMax: hp, ac, creatureKey: '' }]);
    setCustomName('');
    setCustomInitMod('');
    setCustomHp('');
    setCustomAc('');
  }, [customName, customInitMod, customHp, customAc, onAddCreatures]);

  const handleClose = useCallback(() => {
    setSelected(null);
    setSearch('');
    setTab('catalog');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={ms.backdrop} onPress={handleClose}>
        <Pressable style={ms.card} onPress={(e) => e.stopPropagation()}>
          <View style={ms.header}>
            <Text variant="label-lg" weight="bold" style={ms.headerTitle}>
              Add Combatant
            </Text>
            <Pressable onPress={handleClose}>
              <Text style={ms.closeBtn}>✕</Text>
            </Pressable>
          </View>

          <View style={ms.tabs}>
            <Pressable
              style={[ms.tab, tab === 'catalog' && ms.tabActive]}
              onPress={() => setTab('catalog')}
            >
              <Text style={[ms.tabText, tab === 'catalog' && ms.tabTextActive]}>
                Creature Catalog
              </Text>
            </Pressable>
            <Pressable
              style={[ms.tab, tab === 'custom' && ms.tabActive]}
              onPress={() => setTab('custom')}
            >
              <Text style={[ms.tabText, tab === 'custom' && ms.tabTextActive]}>
                Custom NPC
              </Text>
            </Pressable>
          </View>

          {tab === 'catalog' ? (
            <View style={ms.body}>
              <TextInput
                style={ms.searchInput}
                placeholder="Search creatures..."
                placeholderTextColor={colors.outline}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />

              {loading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
              ) : selected ? (
                <ScrollView style={ms.detailScroll}>
                  <View style={ms.detailHeader}>
                    <Pressable onPress={() => setSelected(null)}>
                      <Text style={ms.backLink}>← Back to list</Text>
                    </Pressable>
                  </View>
                  <Text variant="label-lg" weight="bold" style={ms.detailName}>
                    {selected.name}
                  </Text>
                  <Text variant="body-sm" style={ms.detailMeta}>
                    CR {selected.challengeRating} · {selected.creatureType} · {selected.size} · AC {selected.ac} · HP {selected.hp}
                    {selected.hitDice ? ` (${selected.hitDice})` : ''}
                  </Text>

                  <View style={ms.fieldRow}>
                    <View style={{ flex: 2 }}>
                      <Text variant="label-sm" weight="bold" uppercase style={ms.fieldLabel}>
                        Name
                      </Text>
                      <TextInput
                        style={ms.fieldInput}
                        value={nameOverride}
                        onChangeText={setNameOverride}
                        placeholder={selected.name}
                        placeholderTextColor={colors.outline}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="label-sm" weight="bold" uppercase style={ms.fieldLabel}>
                        Quantity
                      </Text>
                      <View style={ms.qtyRow}>
                        <Pressable
                          style={ms.qtyBtn}
                          onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                        >
                          <Text style={ms.qtyBtnText}>−</Text>
                        </Pressable>
                        <Text style={ms.qtyValue}>{quantity}</Text>
                        <Pressable
                          style={ms.qtyBtn}
                          onPress={() => setQuantity((q) => Math.min(10, q + 1))}
                        >
                          <Text style={ms.qtyBtnText}>+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  {selected.hitDice && (
                    <View style={ms.toggleRow}>
                      <Text variant="body-sm" style={ms.toggleLabel}>
                        Roll HP ({selected.hitDice})
                      </Text>
                      <Switch
                        value={shouldRollHp}
                        onValueChange={setShouldRollHp}
                        trackColor={{ false: colors.outlineVariant, true: colors.primaryContainer }}
                        thumbColor={shouldRollHp ? colors.primary : colors.outline}
                      />
                    </View>
                  )}

                  <Pressable style={ms.addBtn} onPress={handleAdd}>
                    <Text style={ms.addBtnText}>
                      Add {quantity > 1 ? `${quantity} ` : ''}{nameOverride || selected.name}{quantity > 1 ? 's' : ''} to Encounter
                    </Text>
                  </Pressable>
                </ScrollView>
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(c) => c.key}
                  style={ms.list}
                  renderItem={({ item }) => (
                    <Pressable style={ms.row} onPress={() => handleSelect(item)}>
                      <View style={{ flex: 1 }}>
                        <Text variant="body-sm" weight="bold" style={ms.rowName}>
                          {item.name}
                        </Text>
                        <Text variant="body-sm" style={ms.rowMeta}>
                          CR {item.challengeRating} · {item.creatureType} · AC {item.ac} · HP {item.hp}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <Text variant="body-sm" style={ms.empty}>No creatures found.</Text>
                  }
                />
              )}
            </View>
          ) : (
            <View style={ms.body}>
              <View style={ms.customForm}>
                <TextInput
                  style={ms.fieldInput}
                  placeholder="Name"
                  placeholderTextColor={colors.outline}
                  value={customName}
                  onChangeText={setCustomName}
                  autoFocus
                />
                <View style={ms.customRow}>
                  <TextInput
                    style={[ms.fieldInput, { flex: 1 }]}
                    placeholder="Init mod"
                    placeholderTextColor={colors.outline}
                    keyboardType="numeric"
                    value={customInitMod}
                    onChangeText={setCustomInitMod}
                  />
                  <TextInput
                    style={[ms.fieldInput, { flex: 1 }]}
                    placeholder="HP"
                    placeholderTextColor={colors.outline}
                    keyboardType="number-pad"
                    value={customHp}
                    onChangeText={setCustomHp}
                  />
                  <TextInput
                    style={[ms.fieldInput, { flex: 1 }]}
                    placeholder="AC"
                    placeholderTextColor={colors.outline}
                    keyboardType="number-pad"
                    value={customAc}
                    onChangeText={setCustomAc}
                  />
                </View>
                <Pressable style={ms.addBtn} onPress={handleAddCustom}>
                  <Text style={ms.addBtnText}>Add to Encounter</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ms = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    backgroundColor: colors.surfaceContainer,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomColor: colors.outlineVariant,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { color: colors.onSurface },
  closeBtn: { color: colors.outline, fontSize: 18, padding: spacing.xs },
  tabs: {
    flexDirection: 'row',
    borderBottomColor: colors.outlineVariant,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomColor: colors.primary,
    borderBottomWidth: 2,
  },
  tabText: { color: colors.outline, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  body: {
    flex: 1,
    padding: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.onSurface,
    fontSize: 14,
  },
  list: {
    marginTop: spacing.sm,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomColor: colors.outlineVariant + '44',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: { color: colors.onSurface },
  rowMeta: { color: colors.outline, marginTop: 2 },
  empty: {
    color: colors.outline,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },

  detailScroll: { marginTop: spacing.sm },
  detailHeader: { marginBottom: spacing.sm },
  backLink: { color: colors.primary, fontSize: 13 },
  detailName: { color: colors.onSurface, fontSize: 18 },
  detailMeta: { color: colors.outline, marginTop: 4 },

  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  fieldLabel: { color: colors.outline, letterSpacing: 1, marginBottom: 4 },
  fieldInput: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    color: colors.onSurface,
    fontSize: 14,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
  },
  qtyBtnText: { color: colors.onSurface, fontSize: 18, fontWeight: '600' },
  qtyValue: { color: colors.onSurface, fontSize: 16, fontWeight: '700', minWidth: 24, textAlign: 'center' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
  },
  toggleLabel: { color: colors.onSurfaceVariant },

  addBtn: {
    backgroundColor: colors.primaryContainer,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  addBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 14 },

  customForm: {
    gap: spacing.sm,
  },
  customRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
