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
  type HomebrewPackRow,
  type HomebrewContentRow,
  type ImportedContentRow,
  type ImportedSourceCard,
} from '@vaultstone/api';
import { ImportContentModal } from '../../../components/imported/ImportContentModal';
import type { HomebrewContentType } from '@vaultstone/types';
import { SpellFormModal } from '../../../components/homebrew/forms/SpellFormModal';
import { ItemFormModal } from '../../../components/homebrew/forms/ItemFormModal';
import { FeatFormModal } from '../../../components/homebrew/forms/FeatFormModal';
import { CreatureFormModal } from '../../../components/homebrew/forms/CreatureFormModal';
import { ClassFormModal } from '../../../components/homebrew/forms/ClassFormModal';
import { SpeciesFormModal } from '../../../components/homebrew/forms/SpeciesFormModal';
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

  const visibleImportedEntries = filterSourceLabel
    ? importedEntries.filter((e) => e.source_label === filterSourceLabel)
    : importedEntries;
  // The authored-entries list isn't tagged by source_label (different
  // table). When a card filter is active we hide authored entries
  // because the user is browsing within a single import; clearing the
  // filter shows authored alongside imported again.
  const visibleAuthoredEntries = filterSourceLabel ? [] : entries;
  const visibleEntryCount = visibleAuthoredEntries.length + visibleImportedEntries.length;
  const totalEntryCount = entries.length + importedEntries.length;

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
    router.back();
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

  async function handleCardDelete(sourceLabel: string) {
    if (!pack) return;
    setCardDeleting(sourceLabel);
    const { error: err } = await deleteImportedEntriesBySourceLabel(pack.id, sourceLabel);
    setCardDeleting(null);
    if (err) return;
    setConfirmCardLabel(null);
    // Clear the filter if it pointed at the card we just removed.
    if (filterSourceLabel === sourceLabel) setFilterSourceLabel(null);
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
          <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
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
              onPress={() => router.back()}
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
                  onTapFilter={() => setFilterSourceLabel(
                    filterSourceLabel === card.sourceLabel ? null : card.sourceLabel,
                  )}
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
                  onPress={() => setFilterSourceLabel(null)}
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

          {/* Authored-entry add row — always available regardless of
              imported content. Hidden while a card filter is active so
              the user isn't tempted to add an authored entry into what
              looks like an imported scope. */}
          {!filterSourceLabel ? (
            <View style={styles.addRow}>
              {(CONTENT_TYPES).map((ct) => (
                <Pressable
                  key={ct.key}
                  onPress={() => openCreateForm(ct.key)}
                  style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
                  accessibilityLabel={`Add ${ct.label.toLowerCase()}`}
                >
                  <Icon name={ct.icon} size={16} color={colors.primary} />
                  <Text variant="label-sm" weight="semibold" uppercase style={{ color: colors.primary, letterSpacing: 1 }}>
                    Add {ct.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {visibleEntryCount === 0 ? (
            <View style={styles.placeholderBox}>
              <Icon name="auto-awesome" size={28} color={colors.outline} />
              <Text variant="body-sm" tone="secondary" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
                {filterSourceLabel
                  ? 'No entries in this import.'
                  : 'Add an authored entry above or import content from JSON.'}
              </Text>
            </View>
          ) : (
            <View style={styles.entriesList}>
              {/* Authored entries — editable. */}
              {CONTENT_TYPES.map((ct) => {
                const group = visibleAuthoredEntries.filter((e) => e.content_type === ct.key);
                if (group.length === 0) return null;
                return (
                  <View key={ct.key} style={styles.entryGroup}>
                    <View style={styles.entryGroupHead}>
                      <MetaLabel size="sm">{ct.pluralLabel} ({group.length})</MetaLabel>
                    </View>
                    {group.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        confirming={confirmEntryId === entry.id}
                        deleting={entryDeleting === entry.id}
                        onEdit={() => openEditForm(entry)}
                        onRequestDelete={() => setConfirmEntryId(entry.id)}
                        onCancelDelete={() => setConfirmEntryId(null)}
                        onConfirmDelete={() => handleEntryDelete(entry)}
                      />
                    ))}
                  </View>
                );
              })}

              {/* Imported entries — read-only, grouped by content_type. */}
              {groupImportedByType(visibleImportedEntries).map(([type, group]) => (
                <View key={`imported-${type}`} style={styles.entryGroup}>
                  <View style={styles.entryGroupHead}>
                    <MetaLabel size="sm">
                      {pluralizeContentType(type)} ({group.length})
                    </MetaLabel>
                  </View>
                  {group.map((entry) => (
                    <ImportedEntryRow key={entry.id} entry={entry} />
                  ))}
                </View>
              ))}
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
    </ScrollView>
  );
}

/** Header subtitle showing the mix of content in the pack. Both authored
 *  and imported counts surface so the user can tell at a glance what the
 *  pack contains without scrolling. */
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
  icon: 'auto-awesome' | 'pets' | 'inventory' | 'stars' | 'school' | 'public';
}> = [
  { key: 'spell',    label: 'Spell',    pluralLabel: 'Spells',    icon: 'auto-awesome' },
  { key: 'creature', label: 'Creature', pluralLabel: 'Creatures', icon: 'pets' },
  { key: 'item',     label: 'Item',     pluralLabel: 'Items',     icon: 'inventory' },
  { key: 'feat',     label: 'Feat',     pluralLabel: 'Feats',     icon: 'stars' },
  { key: 'class',    label: 'Class',    pluralLabel: 'Classes',   icon: 'school' },
  { key: 'species',  label: 'Species',  pluralLabel: 'Species',   icon: 'public' },
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
