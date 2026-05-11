import { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getHomebrewPack,
  updateHomebrewPack,
  deleteHomebrewPack,
  listHomebrewEntries,
  deleteHomebrewEntry,
  listImportedContent,
  listImportedSourceCards,
  deleteImportedEntriesBySourceLabel,
  exportHomebrewPack,
  type HomebrewPackRow,
  type HomebrewContentRow,
  type ImportedContentRow,
  type ImportedSourceCard,
} from '@vaultstone/api';
import { downloadPackJson } from '../../../components/homebrew/packTransferIo';
import { ImportContentModal } from '../../../components/imported/ImportContentModal';
import {
  SpellsList, FeatsList, OptionalFeaturesList, DeitiesList, VariantRulesList,
  ItemsList, CreaturesList, ConditionsList,
  SpeciesList, BackgroundsList, SubclassesList,
} from '../../../components/content-tables/lists';
import { mapEntryToResult, mapImportedEntryToResult } from '@vaultstone/content';
import type {
  HomebrewContentType,
  ContentResult,
  SpellResult,
  FeatResult,
  OptionalFeatureResult,
  DeityResult,
  VariantRuleResult,
  ItemResult,
  CreatureResult,
  ConditionResult,
  SpeciesResult,
  BackgroundResult,
  SubclassResult,
  ClassResult,
} from '@vaultstone/types';
import { SpellFormModal } from '../../../components/homebrew/forms/SpellFormModal';
import { ItemFormModal } from '../../../components/homebrew/forms/ItemFormModal';
import { FeatFormModal } from '../../../components/homebrew/forms/FeatFormModal';
import { CreatureFormModal } from '../../../components/homebrew/forms/CreatureFormModal';
import { ClassFormModal } from '../../../components/homebrew/forms/ClassFormModal';
import { SpeciesFormModal } from '../../../components/homebrew/forms/SpeciesFormModal';
import { BackgroundFormModal } from '../../../components/homebrew/forms/BackgroundFormModal';
import { SubclassFormModal } from '../../../components/homebrew/forms/SubclassFormModal';
import { OptionalFeatureFormModal } from '../../../components/homebrew/forms/OptionalFeatureFormModal';
import { DeityFormModal } from '../../../components/homebrew/forms/DeityFormModal';
import { ConditionFormModal } from '../../../components/homebrew/forms/ConditionFormModal';
import {
  colors,
  spacing,
  radius,
  Card,
  Chip,
  GhostButton,
  Icon,
  Input,
  MetaLabel,
  ScreenHeader,
  Text,
} from '@vaultstone/ui';

type EditableField = 'name' | 'description';

export default function HomebrewPackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [pack, setPack] = useState<HomebrewPackRow | null>(null);
  // Authored entries — editable through the per-content-type form modals
  // and live in homebrew_content.
  const [entries, setEntries] = useState<HomebrewContentRow[]>([]);
  // Imported entries — read-only here; live in imported_content. Re-import
  // through the JSON file picker on the system page replaces them.
  const [importedEntries, setImportedEntries] = useState<ImportedContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<EditableField | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [savingField, setSavingField] = useState<EditableField | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // Export-pack feedback. Both pieces of state belong at component top
  // level (handleExport reads/writes them); kept colocated with delete
  // because export is the parallel "package up the pack" action.
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Form modal state — `formOpen` is the content type whose modal is up;
  // `editingEntry` is the row being edited (null = create mode).
  const [formOpen, setFormOpen] = useState<HomebrewContentType | null>(null);
  const [editingEntry, setEditingEntry] = useState<HomebrewContentRow | null>(null);

  // Per-row delete confirmation. Track by entry id so multiple rows can
  // confirm independently without sharing state.
  const [confirmEntryId, setConfirmEntryId] = useState<string | null>(null);
  const [entryDeleting, setEntryDeleting] = useState<string | null>(null);

  // Imported source cards — one per (pack, source_label). The user names
  // each import inside the pack, so a single pack can hold multiple
  // imports (e.g. "PHB", "Tasha's") rendered as cards.
  const [sourceCards, setSourceCards] = useState<ImportedSourceCard[]>([]);
  // When set, only entries with this source_label render in the entries
  // list. Tapping a card filters; tapping again or hitting "Show all"
  // clears.
  const [filterSourceLabel, setFilterSourceLabel] = useState<string | null>(null);
  // Active content-type tab inside the entries section. `null` = "All",
  // otherwise a specific content_type ('spell', 'feat', 'creature', etc.).
  // Resets when filterSourceLabel changes so the user doesn't carry an
  // empty tab across source filters.
  const [activeTypeTab, setActiveTypeTab] = useState<string | null>(null);
  // Import modal state. `importMode` carries either 'append' (new card)
  // or { kind: 'reimport', sourceLabel }; null means closed.
  const [importMode, setImportMode] = useState<
    | null
    | { kind: 'append' }
    | { kind: 'reimport'; sourceLabel: string }
  >(null);
  // Per-card delete confirmation.
  const [confirmCardLabel, setConfirmCardLabel] = useState<string | null>(null);
  const [cardDeleting, setCardDeleting] = useState<string | null>(null);

  // Reload helper — runs the same Promise.all as the initial mount.
  // Used after import / re-import / card-remove so the page reflects
  // the new database state without remounting.
  async function refresh() {
    if (!id) return;
    const [packRes, entriesRes, importedRes, cardsRes] = await Promise.all([
      getHomebrewPack(id),
      listHomebrewEntries(id),
      listImportedContent(id),
      listImportedSourceCards(id),
    ]);
    if (packRes.error || !packRes.data) return;
    setPack(packRes.data);
    setEntries(entriesRes.data ?? []);
    setImportedEntries(importedRes.data ?? []);
    setSourceCards(cardsRes.data ?? []);
  }

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([
      getHomebrewPack(id),
      listHomebrewEntries(id),
      listImportedContent(id),
      listImportedSourceCards(id),
    ]).then(([packRes, entriesRes, importedRes, cardsRes]) => {
      if (cancelled) return;
      if (packRes.error || !packRes.data) {
        setError('Pack not found.');
        setLoading(false);
        return;
      }
      setPack(packRes.data);
      setEntries(entriesRes.data ?? []);
      setImportedEntries(importedRes.data ?? []);
      setSourceCards(cardsRes.data ?? []);
      setDraftName(packRes.data.name);
      setDraftDescription(packRes.data.description ?? '');
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Source-filter pass: a card tap narrows the entries list to one
  // import. Authored entries aren't tagged by source_label (different
  // table), so when a card filter is active they hide entirely.
  const sourceFilteredImported = filterSourceLabel
    ? importedEntries.filter((e) => e.source_label === filterSourceLabel)
    : importedEntries;
  const sourceFilteredAuthored = filterSourceLabel ? [] : entries;
  const sourceFilteredCount = sourceFilteredAuthored.length + sourceFilteredImported.length;

  // Available content-type tabs: union of authored + imported types
  // present in the source-filtered set, sorted alphabetically by their
  // display label so the chip strip reads predictably.
  const availableTypes = (() => {
    const set = new Set<string>();
    for (const e of sourceFilteredAuthored) set.add(e.content_type);
    for (const e of sourceFilteredImported) set.add(e.content_type);
    return [...set].sort((a, b) =>
      pluralizeContentType(a).localeCompare(pluralizeContentType(b)),
    );
  })();

  // Auto-select the first available type when the active tab isn't
  // valid for the current source-filtered set. Covers two cases: first
  // mount (activeTypeTab starts null) and reset cases (source filter
  // change leaves the active type with zero entries). The All chip was
  // removed, so there's no "no tab" state — we always need one selected.
  useEffect(() => {
    if (availableTypes.length === 0) {
      if (activeTypeTab !== null) setActiveTypeTab(null);
      return;
    }
    if (activeTypeTab === null || !availableTypes.includes(activeTypeTab)) {
      setActiveTypeTab(availableTypes[0]);
    }
  }, [availableTypes.join('|'), activeTypeTab]);

  // Type-tab pass on top of the source filter.
  const visibleAuthoredEntries = activeTypeTab
    ? sourceFilteredAuthored.filter((e) => e.content_type === activeTypeTab)
    : sourceFilteredAuthored;
  const visibleImportedEntries = activeTypeTab
    ? sourceFilteredImported.filter((e) => e.content_type === activeTypeTab)
    : sourceFilteredImported;
  const visibleEntryCount = visibleAuthoredEntries.length + visibleImportedEntries.length;
  const totalEntryCount = entries.length + importedEntries.length;

  // Hydrate the visible authored + imported rows into ContentResult shapes
  // bucketed by type. The shared content-table list components consume
  // *Result[] (the same shape the system page renders for SRD content),
  // so re-using mapEntryToResult / mapImportedEntryToResult here gives
  // us the same row layout, sort/filter chrome, and source badges as the
  // system page tabs without re-implementing any of it.
  const hydrated = (() => {
    const out: {
      spell: SpellResult[];
      feat: FeatResult[];
      'optional-feature': OptionalFeatureResult[];
      deity: DeityResult[];
      'variant-rule': VariantRuleResult[];
      item: ItemResult[];
      creature: CreatureResult[];
      condition: ConditionResult[];
      species: SpeciesResult[];
      background: BackgroundResult[];
      subclass: SubclassResult[];
      class: ClassResult[];
      // Maps entry-key (`homebrew_<id>` or imported entry.key) back to
      // the original DB row so the list rowActions can hand the right
      // record to openEditForm / handleEntryDelete.
      authoredByKey: Map<string, HomebrewContentRow>;
    } = {
      spell: [], feat: [], 'optional-feature': [], deity: [], 'variant-rule': [],
      item: [], creature: [], condition: [],
      species: [], background: [], subclass: [], class: [],
      authoredByKey: new Map(),
    };
    if (!pack) return out;
    for (const row of visibleAuthoredEntries) {
      const r = mapEntryToResult(row, pack);
      if (!r) continue;
      out.authoredByKey.set(r.key, row);
      pushByType(out, r);
    }
    for (const row of visibleImportedEntries) {
      const r = mapImportedEntryToResult(row, pack);
      if (!r) continue;
      pushByType(out, r);
    }
    return out;
  })();

  async function commitField(field: EditableField) {
    if (!pack) return;
    const patch = field === 'name'
      ? { name: draftName.trim() || pack.name }
      : { description: draftDescription.trim() || null };
    setSavingField(field);
    const { data, error: err } = await updateHomebrewPack(pack.id, patch);
    setSavingField(null);
    if (err || !data) return;
    setPack(data);
    setEditing(null);
  }

  async function handleDelete() {
    if (!pack) return;
    setDeleting(true);
    setDeleteError('');
    const { error: err } = await deleteHomebrewPack(pack.id);
    setDeleting(false);
    if (err) {
      setDeleteError(err.message);
      return;
    }
    // After delete, navigate to the parent system page when there's no
    // history to fall back to — the page we're on no longer exists.
    if (router.canGoBack()) router.back();
    else router.replace(`/(drawer)/game-systems/${pack.system}` as never);
  }

  function handleEntrySaved(saved: HomebrewContentRow) {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx === -1) return [...prev, saved];
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
    setFormOpen(null);
    setEditingEntry(null);
  }

  function openCreateForm(contentType: HomebrewContentType) {
    setEditingEntry(null);
    setFormOpen(contentType);
  }

  function openEditForm(entry: HomebrewContentRow) {
    setEditingEntry(entry);
    setFormOpen(entry.content_type as HomebrewContentType);
  }

  async function handleEntryDelete(entry: HomebrewContentRow) {
    setEntryDeleting(entry.id);
    const { error: err } = await deleteHomebrewEntry(entry.id);
    setEntryDeleting(null);
    if (err) return; // surface in row-level UI in a follow-up
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setConfirmEntryId(null);
  }

  /**
   * Build a vaultstone-pack/v1 JSON blob from this pack and offer it
   * to the user as a download (web) or write it to the cache dir
   * (native). RLS gates read access — co-DMs and campaign members who
   * can read the pack can also export it. The exporter attests they
   * had rights to whatever is in the file; the importer re-attests on
   * the receiving side.
   */
  async function handleExport() {
    if (!pack) return;
    setExporting(true);
    setExportMessage(null);
    const { data, error: err } = await exportHomebrewPack(pack.id);
    if (err || !data) {
      setExporting(false);
      setExportMessage(err?.message ?? 'Failed to read pack contents.');
      return;
    }
    const fileName = `${pack.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-pack.json`;
    const result = await downloadPackJson({ fileName, payload: data });
    setExporting(false);
    if (!result.ok) {
      setExportMessage(result.message);
      return;
    }
    setExportMessage(
      result.uri
        ? `Saved to ${result.uri}`
        : `Downloaded ${fileName} (${data.importedEntries.length + data.homebrewEntries.length} entries).`,
    );
  }

  async function handleCardDelete(sourceLabel: string) {
    if (!pack) return;
    setCardDeleting(sourceLabel);
    const { error: err } = await deleteImportedEntriesBySourceLabel(pack.id, sourceLabel);
    setCardDeleting(null);
    if (err) return;
    setConfirmCardLabel(null);
    // Clear the filter if it pointed at the card we just removed.
    if (filterSourceLabel === sourceLabel) {
      setFilterSourceLabel(null);
      setActiveTypeTab(null);
    }
    await refresh();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (error || !pack) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
        <ScreenHeader title="Homebrew Pack" />
        <View style={styles.centered}>
          <Icon name="error-outline" size={48} color={colors.outline} />
          <Text variant="title-md" family="headline" weight="bold" style={{ marginTop: spacing.md }}>
            {error || 'Pack not found.'}
          </Text>
          <Pressable
            onPress={() => {
              if (router.canGoBack()) router.back();
              // No pack in scope here — fall back to the systems list.
              else router.replace('/(drawer)/game-systems' as never);
            }}
            style={{ marginTop: spacing.md }}
          >
            <Text variant="body-md" style={{ color: colors.primary }}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <ScreenHeader
        title={pack.name}
        subtitle={packSubtitle(entries.length, sourceCards.length)}
        actions={
          <View style={{ flexDirection: 'row', gap: spacing.xs }}>
            <GhostButton
              label="Back"
              icon="arrow-back"
              // Fall back to the parent system page when there's no
              // navigation history (deep link, web refresh, opened from
              // a notification). Otherwise router.back() silently
              // becomes a no-op and the user gets stranded.
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace(`/(drawer)/game-systems/${pack.system}` as never);
              }}
            />
            <GhostButton
              label={exporting ? 'Exporting…' : 'Export'}
              icon="file-download"
              onPress={handleExport}
              disabled={exporting}
            />
            <GhostButton
              label="Delete"
              icon="delete"
              onPress={() => setConfirmingDelete(true)}
            />
          </View>
        }
      />

      {confirmingDelete ? (
        <View style={styles.deleteBanner}>
          <Icon name="warning" size={18} color={colors.hpDanger} />
          <Text variant="body-sm" family="body" style={{ flex: 1, color: colors.onSurface }}>
            {deleteError || (
              <>
                Delete <Text weight="bold">{pack.name}</Text>? This permanently removes the pack
                {totalEntryCount > 0 ? ` and its ${totalEntryCount} ${totalEntryCount === 1 ? 'entry' : 'entries'}` : ''}.
              </>
            )}
          </Text>
          <Pressable
            onPress={() => {
              setConfirmingDelete(false);
              setDeleteError('');
            }}
            style={[styles.bannerBtn, styles.bannerCancel]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            disabled={deleting}
            style={[styles.bannerBtn, styles.bannerDelete]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: '#fff', letterSpacing: 1 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Export status banner — surfaces success or error after the
          user clicks Export. Stays put until they dismiss; the button
          itself shows in-flight progress via its label. */}
      {exportMessage ? (
        <View style={styles.deleteBanner}>
          <Icon name="info-outline" size={18} color={colors.outline} />
          <Text variant="body-sm" family="body" style={{ flex: 1, color: colors.onSurface }}>
            {exportMessage}
          </Text>
          <Pressable
            onPress={() => setExportMessage(null)}
            style={[styles.bannerBtn, styles.bannerCancel]}
          >
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
              Dismiss
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.body}>
        {/* Pack info card */}
        <Card tier="container" padding="lg" style={styles.card}>
          <View style={styles.cardSectionHeader}>
            <MetaLabel size="sm">Details</MetaLabel>
          </View>

          {/* Name (editable) */}
          <View style={styles.fieldRow}>
            <Text variant="label-md" weight="semibold" uppercase style={styles.fieldLabel}>
              Name
            </Text>
            {editing === 'name' ? (
              <View style={styles.fieldEditor}>
                <Input
                  value={draftName}
                  onChangeText={setDraftName}
                  autoFocus
                />
                <View style={styles.editActions}>
                  <Pressable
                    onPress={() => {
                      setDraftName(pack.name);
                      setEditing(null);
                    }}
                    style={[styles.editBtn, styles.editCancel]}
                  >
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => commitField('name')}
                    disabled={savingField === 'name'}
                    style={[styles.editBtn, styles.editSave]}
                  >
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onPrimary }}>
                      {savingField === 'name' ? 'Saving…' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setEditing('name')}
                style={styles.fieldValue}
              >
                <Text variant="body-md">{pack.name}</Text>
                <Icon name="edit" size={16} color={colors.outline} />
              </Pressable>
            )}
          </View>

          {/* Description (editable) */}
          <View style={styles.fieldRow}>
            <Text variant="label-md" weight="semibold" uppercase style={styles.fieldLabel}>
              Description
            </Text>
            {editing === 'description' ? (
              <View style={styles.fieldEditor}>
                <Input
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 72, textAlignVertical: 'top' }}
                />
                <View style={styles.editActions}>
                  <Pressable
                    onPress={() => {
                      setDraftDescription(pack.description ?? '');
                      setEditing(null);
                    }}
                    style={[styles.editBtn, styles.editCancel]}
                  >
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => commitField('description')}
                    disabled={savingField === 'description'}
                    style={[styles.editBtn, styles.editSave]}
                  >
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onPrimary }}>
                      {savingField === 'description' ? 'Saving…' : 'Save'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setEditing('description')}
                style={styles.fieldValue}
              >
                <Text
                  variant="body-md"
                  style={{ color: pack.description ? colors.onSurface : colors.outline, flex: 1 }}
                >
                  {pack.description ?? 'Add a description…'}
                </Text>
                <Icon name="edit" size={16} color={colors.outline} />
              </Pressable>
            )}
          </View>

        </Card>

        {/* Imported sources card grid. One card per (pack, source_label).
            Tap to filter the entries list to just that import; long
            press the card actions to re-import or remove. */}
        <Card tier="container" padding="lg" style={styles.card}>
          <View style={styles.cardSectionHeader}>
            <MetaLabel size="sm">Imported sources</MetaLabel>
            <Text variant="body-sm" tone="secondary">
              {sourceCards.length === 0
                ? 'No imports yet'
                : `${sourceCards.length} ${sourceCards.length === 1 ? 'import' : 'imports'}`}
            </Text>
          </View>

          {sourceCards.length === 0 ? null : (
            <View style={styles.cardGrid}>
              {sourceCards.map((card) => (
                <SourceCardView
                  key={card.sourceLabel}
                  card={card}
                  active={filterSourceLabel === card.sourceLabel}
                  confirming={confirmCardLabel === card.sourceLabel}
                  deleting={cardDeleting === card.sourceLabel}
                  onTapFilter={() => {
                    setFilterSourceLabel(
                      filterSourceLabel === card.sourceLabel ? null : card.sourceLabel,
                    );
                    setActiveTypeTab(null);
                  }}
                  onReimport={() => setImportMode({ kind: 'reimport', sourceLabel: card.sourceLabel })}
                  onRequestRemove={() => setConfirmCardLabel(card.sourceLabel)}
                  onCancelRemove={() => setConfirmCardLabel(null)}
                  onConfirmRemove={() => handleCardDelete(card.sourceLabel)}
                />
              ))}
            </View>
          )}

          <Pressable
            onPress={() => setImportMode({ kind: 'append' })}
            style={({ pressed }) => [styles.addImportBtn, pressed && { opacity: 0.85 }]}
            accessibilityLabel="Add imported content from JSON"
          >
            <Icon name="add" size={16} color={colors.primary} />
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.primary, letterSpacing: 1 }}>
              Add imported content from JSON
            </Text>
          </Pressable>
        </Card>

        {/* Entries section */}
        <Card tier="container" padding="lg" style={styles.card}>
          <View style={styles.cardSectionHeader}>
            <MetaLabel size="sm">
              {filterSourceLabel ? `Entries · ${filterSourceLabel}` : 'Contents'}
            </MetaLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {filterSourceLabel ? (
                <Pressable
                  onPress={() => { setFilterSourceLabel(null); setActiveTypeTab(null); }}
                  style={styles.clearFilterBtn}
                >
                  <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.primary, letterSpacing: 1 }}>
                    Show all
                  </Text>
                </Pressable>
              ) : null}
              <Text variant="body-sm" tone="secondary">
                {visibleEntryCount === 0
                  ? 'No entries'
                  : `${visibleEntryCount} of ${totalEntryCount}`}
              </Text>
            </View>
          </View>

          {/* Create Homebrew — dedicated authoring entry point.
              Always visible (regardless of imports/authored counts)
              so the user can author additional entries on top of an
              imported pack. Hidden only when the player has filtered
              to a specific imported source card, since "add new" then
              reads as "add into that import's scope," which we don't
              support (imports are immutable per re-import). */}
          {!filterSourceLabel ? (
            <View style={styles.createSection}>
              <Text
                variant="label-sm"
                weight="bold"
                uppercase
                style={{ color: colors.onSurfaceVariant, letterSpacing: 1.25, marginBottom: spacing.xs }}
              >
                Create Homebrew
              </Text>
              <View style={[styles.addRow, { marginBottom: 0 }]}>
                {(CONTENT_TYPES).map((ct) => (
                  <Pressable
                    key={ct.key}
                    onPress={() => openCreateForm(ct.key)}
                    style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
                    accessibilityLabel={`Add ${ct.label.toLowerCase()}`}
                  >
                    <Icon name={ct.icon} size={16} color={colors.primary} />
                    <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.primary, letterSpacing: 1 }}>
                      {ct.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {availableTypes.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.typeTabsRow}
            >
              {availableTypes.map((type) => {
                const count =
                  sourceFilteredAuthored.filter((e) => e.content_type === type).length
                  + sourceFilteredImported.filter((e) => e.content_type === type).length;
                const active = activeTypeTab === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setActiveTypeTab(type)}
                    style={[styles.typeTab, active && styles.typeTabActive]}
                  >
                    <Text
                      variant="label-sm"
                      weight="bold"
                      uppercase
                      style={{
                        color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                        letterSpacing: 1.25,
                      }}
                    >
                      {pluralizeContentType(type)} · {count}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {activeTypeTab !== null && visibleEntryCount > 0 ? (
            // Specific type tab: render the matching shared list
            // component, the same one the system page uses for SRD
            // browsing. Authored rows get a row-action gutter slot
            // (edit + delete); imported rows skip the slot.
            renderTypeList({
              type: activeTypeTab,
              hydrated,
              system: pack.system,
              onEditAuthored: (key) => {
                const row = hydrated.authoredByKey.get(key);
                if (row) openEditForm(row);
              },
              onDeleteAuthored: (key) => {
                const row = hydrated.authoredByKey.get(key);
                if (row) {
                  // Match the existing per-row confirm/delete UX —
                  // re-use the row id for confirmation gating.
                  if (confirmEntryId === row.id) handleEntryDelete(row);
                  else setConfirmEntryId(row.id);
                }
              },
              addAction: !filterSourceLabel
                ? renderAddActionForType(activeTypeTab, openCreateForm)
                : undefined,
            })
          ) : (
            <View style={styles.placeholderBox}>
              <Icon name="auto-awesome" size={28} color={colors.outline} />
              <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
                {filterSourceLabel
                  ? 'No entries in this import.'
                  : 'Add an authored entry above or import content from JSON.'}
              </Text>
            </View>
          )}
        </Card>
      </View>

      {/* Import modal — drives both "append a new card" and "re-import
          this card" flows. The modal targets the current pack via
          packId, so it never creates a new pack from this entry point. */}
      {importMode && pack ? (
        <ImportContentModal
          visible
          systemId={pack.system}
          packId={pack.id}
          initialSourceLabel={importMode.kind === 'reimport' ? importMode.sourceLabel : undefined}
          onClose={() => setImportMode(null)}
          onImported={() => { setImportMode(null); refresh(); }}
        />
      ) : null}

      {pack && formOpen === 'spell' ? (
        <SpellFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'item' ? (
        <ItemFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'feat' ? (
        <FeatFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'creature' ? (
        <CreatureFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'class' ? (
        <ClassFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'species' ? (
        <SpeciesFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'background' ? (
        <BackgroundFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'subclass' ? (
        <SubclassFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'optional-feature' ? (
        <OptionalFeatureFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'deity' ? (
        <DeityFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
      {pack && formOpen === 'condition' ? (
        <ConditionFormModal
          pack={pack}
          entry={editingEntry ?? undefined}
          onClose={() => { setFormOpen(null); setEditingEntry(null); }}
          onSaved={handleEntrySaved}
        />
      ) : null}
    </ScrollView>
  );
}

/** Header subtitle showing the mix of content in the pack. Both authored
 *  and imported counts surface so the user can tell at a glance what the
 *  pack contains without scrolling. */
/** Per-type list dispatcher. Picks the matching shared list component
 *  for the active type tab and feeds it the hydrated result rows. The
 *  component handles search, sort, filter, source-tab dedupe, etc. —
 *  this dispatcher only owns the row-action callbacks and the optional
 *  "+ Add" button that goes in the table's headerExtra slot. */
function renderTypeList(args: {
  type: string;
  hydrated: {
    spell: SpellResult[];
    feat: FeatResult[];
    'optional-feature': OptionalFeatureResult[];
    deity: DeityResult[];
    'variant-rule': VariantRuleResult[];
    item: ItemResult[];
    creature: CreatureResult[];
    condition: ConditionResult[];
    species: SpeciesResult[];
    background: BackgroundResult[];
    subclass: SubclassResult[];
    class: ClassResult[];
    authoredByKey: Map<string, HomebrewContentRow>;
  };
  system: string;
  onEditAuthored: (key: string) => void;
  onDeleteAuthored: (key: string) => void;
  addAction?: React.ReactNode;
}): React.ReactNode {
  const { type, hydrated, onEditAuthored, onDeleteAuthored, addAction } = args;
  // Authored rows get edit + delete buttons in the table's row-action
  // gutter. The shared list components consume *Result entries; we
  // detect the authored ones by checking whether their key is in
  // `authoredByKey` (imported keys never collide with `homebrew_` ids).
  function rowActionsFor<T extends ContentResult>(active: T): React.ReactNode {
    if (!hydrated.authoredByKey.has(active.key)) return null;
    return (
      <>
        <Pressable
          onPress={() => onEditAuthored(active.key)}
          style={listActionStyles.iconBtn}
          accessibilityLabel={`Edit ${active.name}`}
        >
          <Icon name="edit" size={14} color={colors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          onPress={() => onDeleteAuthored(active.key)}
          style={listActionStyles.iconBtn}
          accessibilityLabel={`Delete ${active.name}`}
        >
          <Icon name="delete" size={14} color={colors.onSurfaceVariant} />
        </Pressable>
      </>
    );
  }
  switch (type) {
    case 'spell':
      return <SpellsList items={hydrated.spell} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'feat':
      return <FeatsList items={hydrated.feat} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'optional-feature':
      return <OptionalFeaturesList items={hydrated['optional-feature']} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'deity':
      return <DeitiesList items={hydrated.deity} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'variant-rule':
      return <VariantRulesList items={hydrated['variant-rule']} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'item':
      return <ItemsList items={hydrated.item} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'creature':
      return <CreaturesList items={hydrated.creature} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'condition':
      return <ConditionsList items={hydrated.condition} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'species':
      return <SpeciesList items={hydrated.species} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'background':
      return <BackgroundsList items={hydrated.background} rowActions={rowActionsFor} headerExtra={addAction} />;
    case 'subclass':
      return <SubclassesList items={hydrated.subclass} rowActions={rowActionsFor} headerExtra={addAction} />;
    default:
      // 'class' and any other types fall through; the pack page doesn't
      // surface a class table view since classes have a separate detail
      // modal (system-page only). Render a small placeholder so the user
      // knows the tab is intentional.
      return (
        <View style={listActionStyles.placeholder}>
          <Text variant="body-sm" tone="secondary">
            No table view for this content type yet.
          </Text>
        </View>
      );
  }
}

/** Per-type "+ Add X" button rendered at the top of a type-tab's table
 *  via headerExtra. Falls back to null for types with no authoring
 *  form (e.g. 'condition', 'background', 'subclass'). */
function renderAddActionForType(
  type: string,
  openCreateForm: (type: HomebrewContentType) => void,
): React.ReactNode | undefined {
  const ct = CONTENT_TYPES.find((c) => c.key === type);
  if (!ct) return undefined;
  return (
    <Pressable
      onPress={() => openCreateForm(ct.key)}
      style={({ pressed }) => [listActionStyles.addBtn, pressed && { opacity: 0.85 }]}
      accessibilityLabel={`Add ${ct.label.toLowerCase()}`}
    >
      <Icon name={ct.icon} size={16} color={colors.primary} />
      <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.primary, letterSpacing: 1 }}>
        Add {ct.label}
      </Text>
    </Pressable>
  );
}

const listActionStyles = StyleSheet.create({
  iconBtn: {
    width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
    marginBottom: spacing.sm,
  },
  placeholder: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
});

/** Bucket a hydrated result into the matching per-type bin. The
 *  buckets are typed strictly so the list components below get the
 *  narrow Result[] they expect — switching on `r.type` narrows the
 *  union for TypeScript. */
function pushByType(
  out: {
    spell: SpellResult[];
    feat: FeatResult[];
    'optional-feature': OptionalFeatureResult[];
    deity: DeityResult[];
    'variant-rule': VariantRuleResult[];
    item: ItemResult[];
    creature: CreatureResult[];
    condition: ConditionResult[];
    species: SpeciesResult[];
    background: BackgroundResult[];
    subclass: SubclassResult[];
    class: ClassResult[];
  },
  r: ContentResult,
) {
  switch (r.type) {
    case 'spell':            out.spell.push(r as SpellResult); break;
    case 'feat':             out.feat.push(r as FeatResult); break;
    case 'optional-feature': out['optional-feature'].push(r as OptionalFeatureResult); break;
    case 'deity':            out.deity.push(r as DeityResult); break;
    case 'variant-rule':     out['variant-rule'].push(r as VariantRuleResult); break;
    case 'item':             out.item.push(r as ItemResult); break;
    case 'monster':          out.creature.push(r as CreatureResult); break;
    case 'condition':        out.condition.push(r as ConditionResult); break;
    case 'species':          out.species.push(r as SpeciesResult); break;
    case 'background':       out.background.push(r as BackgroundResult); break;
    case 'subclass':         out.subclass.push(r as SubclassResult); break;
    case 'class':            out.class.push(r as ClassResult); break;
    // Other types (rules-of-play prose, reference catalogs) don't have a list view here.
  }
}

function packSubtitle(authored: number, imports: number): string {
  if (authored === 0 && imports === 0) return 'Empty pack';
  const parts: string[] = [];
  if (authored > 0) parts.push(`${authored} authored ${authored === 1 ? 'entry' : 'entries'}`);
  if (imports > 0) parts.push(`${imports} ${imports === 1 ? 'import' : 'imports'}`);
  return parts.join(' · ');
}

function formatRelativeTime(isoTs: string): string {
  const ts = Date.parse(isoTs);
  if (!Number.isFinite(ts)) return '';
  const ms = Date.now() - ts;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} mo ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} yr ago`;
}

/** Card view for one imported source. Shows label, filename, import age,
 *  and per-content-type counts. Tap toggles the entries-list filter;
 *  separate buttons handle re-import and remove. */
function SourceCardView({
  card, active, confirming, deleting,
  onTapFilter, onReimport, onRequestRemove, onCancelRemove, onConfirmRemove,
}: {
  card: ImportedSourceCard;
  active: boolean;
  confirming: boolean;
  deleting: boolean;
  onTapFilter: () => void;
  onReimport: () => void;
  onRequestRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}) {
  const typeLine = Object.entries(card.contentTypeCounts)
    .map(([type, count]) => `${count} ${pluralizeContentType(type).toLowerCase()}`)
    .join(' · ');
  return (
    <Pressable
      onPress={onTapFilter}
      style={({ pressed }) => [
        styles.sourceCard,
        active && styles.sourceCardActive,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.sourceCardHead}>
        <Text variant="title-sm" family="headline" weight="bold" numberOfLines={1} style={{ flex: 1, color: colors.onSurface }}>
          {card.sourceLabel}
        </Text>
        {active ? <Icon name="filter-list" size={16} color={colors.primary} /> : null}
      </View>
      {card.sourceUrl ? (
        <Text variant="body-sm" tone="secondary" numberOfLines={1} style={styles.sourceCardSub}>
          {card.sourceUrl} · {formatRelativeTime(card.importedAt)}
        </Text>
      ) : (
        <Text variant="body-sm" tone="secondary" style={styles.sourceCardSub}>
          {formatRelativeTime(card.importedAt)}
        </Text>
      )}
      {typeLine ? (
        <Text variant="body-sm" tone="secondary" numberOfLines={2} style={styles.sourceCardCounts}>
          {typeLine}
        </Text>
      ) : null}
      {card.fluffPatchCount > 0 ? (
        <View style={styles.fluffBadge} accessibilityLabel={`Flavor prose patched onto ${card.fluffPatchCount} entries${card.fluffSourceName ? ` from ${card.fluffSourceName}` : ''}`}>
          <Icon name="auto-awesome" size={12} color={colors.primary} />
          <Text variant="label-sm" weight="semibold" style={styles.fluffBadgeText}>
            Flavor · {card.fluffPatchCount}
          </Text>
        </View>
      ) : null}
      {confirming ? (
        <View style={styles.sourceCardActions}>
          <Pressable onPress={onCancelRemove} style={[styles.sourceCardBtn, styles.sourceCardCancel]}>
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={onConfirmRemove} disabled={deleting} style={[styles.sourceCardBtn, styles.sourceCardDelete]}>
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: '#fff', letterSpacing: 1 }}>
              {deleting ? 'Removing…' : 'Remove'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.sourceCardActions}>
          <Pressable onPress={onReimport} style={[styles.sourceCardBtn, styles.sourceCardSecondary]}>
            <Icon name="refresh" size={14} color={colors.primary} />
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.primary, letterSpacing: 1 }}>
              Re-import
            </Text>
          </Pressable>
          <Pressable onPress={onRequestRemove} style={[styles.sourceCardBtn, styles.sourceCardSecondary]}>
            <Icon name="delete-outline" size={14} color={colors.onSurfaceVariant} />
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
              Remove
            </Text>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}

// Content-type metadata: label, plural form for group headings, icon used
// in the "Add ..." action chips.
const CONTENT_TYPES: Array<{
  key: HomebrewContentType;
  label: string;
  pluralLabel: string;
  icon:
    | 'auto-awesome' | 'pets' | 'inventory' | 'stars' | 'school' | 'public'
    | 'menu-book' | 'extension' | 'church' | 'flag' | 'mood-bad';
}> = [
  { key: 'spell',            label: 'Spell',            pluralLabel: 'Spells',            icon: 'auto-awesome' },
  { key: 'creature',         label: 'Creature',         pluralLabel: 'Creatures',         icon: 'pets' },
  { key: 'item',             label: 'Item',             pluralLabel: 'Items',             icon: 'inventory' },
  { key: 'feat',             label: 'Feat',             pluralLabel: 'Feats',             icon: 'stars' },
  { key: 'class',            label: 'Class',            pluralLabel: 'Classes',           icon: 'school' },
  { key: 'subclass',         label: 'Subclass',         pluralLabel: 'Subclasses',        icon: 'flag' },
  { key: 'species',          label: 'Species',          pluralLabel: 'Species',           icon: 'public' },
  { key: 'background',       label: 'Background',       pluralLabel: 'Backgrounds',       icon: 'menu-book' },
  { key: 'optional-feature', label: 'Optional Feature', pluralLabel: 'Optional Features', icon: 'extension' },
  { key: 'deity',            label: 'Deity',            pluralLabel: 'Deities',           icon: 'church' },
  { key: 'condition',        label: 'Condition',        pluralLabel: 'Conditions',        icon: 'mood-bad' },
];

// Group imported entries by content_type so they render under the same
// section-header pattern authored entries use. Sort by name within each
// group for stable display.
function groupImportedByType(rows: ImportedContentRow[]): Array<[string, ImportedContentRow[]]> {
  const buckets = new Map<string, ImportedContentRow[]>();
  for (const r of rows) {
    const slot = buckets.get(r.content_type) ?? [];
    slot.push(r);
    buckets.set(r.content_type, slot);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/**
 * Imports use content_type strings that don't necessarily match the
 * authoring CONTENT_TYPES list (e.g. 'subclass' isn't in the authoring
 * union). Light pluralization fallback for headings.
 */
function pluralizeContentType(type: string): string {
  const known = CONTENT_TYPES.find((ct) => ct.key === type);
  if (known) return known.pluralLabel;
  // Capitalize + add 's' for unknown types.
  const cap = type.charAt(0).toUpperCase() + type.slice(1);
  return `${cap}s`;
}

/**
 * Read-only row for an imported entry. Shows name + source-book code
 * (e.g. "PHB"); no edit/delete affordance — imported entries are
 * managed by re-running or removing the import on the system page.
 */
function ImportedEntryRow({ entry }: { entry: ImportedContentRow }) {
  return (
    <View style={styles.importedEntryRow}>
      <View style={{ flex: 1 }}>
        <Text variant="body-md" weight="semibold" numberOfLines={1}>
          {entry.name}
        </Text>
        {entry.source_code ? (
          <MetaLabel size="sm">
            {entry.source_code}{entry.source_page ? ` · p.${entry.source_page}` : ''}
          </MetaLabel>
        ) : null}
      </View>
    </View>
  );
}

function EntryRow({
  entry,
  confirming,
  deleting,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  entry: HomebrewContentRow;
  confirming: boolean;
  deleting: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const data = entry.data as { description?: string } | null;
  const description = data?.description ?? '';

  return (
    <View style={styles.entryRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body-sm" family="body" weight="bold" style={{ color: colors.onSurface }}>
          {entry.name}
        </Text>
        {description ? (
          <Text variant="body-sm" tone="secondary" numberOfLines={2} style={{ color: colors.onSurfaceVariant }}>
            {description}
          </Text>
        ) : null}
      </View>

      {confirming ? (
        <View style={styles.entryConfirmRow}>
          <Pressable onPress={onCancelDelete} style={[styles.entryActionBtn, styles.entryCancelBtn]}>
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.onSurfaceVariant, letterSpacing: 1 }}>
              Cancel
            </Text>
          </Pressable>
          <Pressable onPress={onConfirmDelete} disabled={deleting} style={[styles.entryActionBtn, styles.entryDeleteBtn]}>
            <Text variant="label-sm" weight="semibold" uppercase style={{ color: '#fff', letterSpacing: 1 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.entryActionRow}>
          <Pressable onPress={onEdit} style={styles.entryIconBtn} accessibilityLabel={`Edit ${entry.name}`}>
            <Icon name="edit" size={16} color={colors.onSurfaceVariant} />
          </Pressable>
          <Pressable onPress={onRequestDelete} style={styles.entryIconBtn} accessibilityLabel={`Delete ${entry.name}`}>
            <Icon name="delete" size={16} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  body: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  deleteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.hpDanger + '14',
    borderWidth: 1,
    borderColor: colors.hpDanger + '55',
    flexWrap: 'wrap',
  },
  bannerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  bannerCancel: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  bannerDelete: {
    borderColor: colors.hpDanger,
    backgroundColor: colors.hpDanger,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  cardSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  fieldRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '22',
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.outline,
    letterSpacing: 1,
  },
  fieldValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldEditor: {
    gap: spacing.sm,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'flex-end',
  },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  editCancel: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  editSave: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  placeholderBox: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceContainerLow + '88',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '22',
    borderStyle: 'dashed',
  },
  // Create Homebrew section — wraps the type buttons in a small
  // labeled card so the authoring affordance is obviously a creation
  // surface even when the pack already has imported entries.
  createSection: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sourceCard: {
    flexBasis: 240,
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
    gap: spacing.xs,
  },
  sourceCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryContainer + '22',
  },
  sourceCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sourceCardSub: {
    color: colors.onSurfaceVariant,
  },
  sourceCardCounts: {
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  /** Flavor-prose chip on the source card — visible when a fluff
   *  import has patched description text onto entries in the card. */
  fluffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: spacing.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primary + '1a',
    borderWidth: 1,
    borderColor: colors.primary + '55',
  },
  fluffBadgeText: {
    color: colors.primary,
    letterSpacing: 0.4,
  },
  sourceCardActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sourceCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  sourceCardSecondary: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  sourceCardCancel: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  sourceCardDelete: {
    borderColor: colors.hpDanger,
    backgroundColor: colors.hpDanger,
  },
  addImportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary + '55',
    backgroundColor: 'transparent',
  },
  clearFilterBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  typeTabsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  typeTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeTabActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primary,
  },
  importedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  importedEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainer,
  },
  entriesList: {
    gap: spacing.lg,
  },
  entryGroup: {
    gap: spacing.xs,
  },
  entryGroupHead: {
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '33',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  entryActionRow: {
    flexDirection: 'row',
    gap: 4,
  },
  entryIconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  entryConfirmRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  entryActionBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  entryCancelBtn: {
    borderColor: colors.outlineVariant + '55',
    backgroundColor: 'transparent',
  },
  entryDeleteBtn: {
    borderColor: colors.hpDanger,
    backgroundColor: colors.hpDanger,
  },
});
