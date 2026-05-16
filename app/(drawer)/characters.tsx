import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet, useWindowDimensions, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getMyCharacters,
  supabase,
  listCharacterDrafts,
  deleteCharacterDraft,
  uploadCharacterCardImage,
  type CharacterDraftRow,
} from '@vaultstone/api';
import { useAuthStore, useCharacterStore } from '@vaultstone/store';
import { colors, spacing, ImageCropModal } from '@vaultstone/ui';
import type { Database } from '@vaultstone/types';

type Character = Database['public']['Tables']['characters']['Row'];

// The unified list mixes a "+ New" tile, drafts, and completed characters.
// A discriminator field on each entry keeps the renderer's switch tight.
type ListItem =
  | { kind: 'new' }
  | { kind: 'draft'; row: CharacterDraftRow }
  | { kind: 'character'; row: Character };

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Turn a content key into a human label without going through
// ContentResolver. Strips both SRD suffixes ("-srd-5-1", "-srd-2-0")
// and homebrew-import prefixes ("imported_<system>_<edition>_<type>_<source>_"),
// then title-cases the remaining hyphen/underscore segments.
//
// Examples:
//   "human"                                            → "Human"
//   "fighter-srd-5-1"                                  → "Fighter"
//   "imported_dnd5e_2014_species_phb_dwarf"            → "Dwarf"
//   "imported_dnd5e_2014_class_phb_fighter"            → "Fighter"
function prettifyContentKey(key: string): string {
  let s = key;
  // Drop the imported-content prefix if present. We don't actually care
  // which of the seven prefix segments come back — the meaningful name
  // is whatever's after the source slug.
  const importedMatch = s.match(/^imported_[^_]+_[^_]+_[^_]+_[^_]+_(.+)$/);
  if (importedMatch) s = importedMatch[1];
  // Strip SRD edition suffixes.
  s = s.replace(/-srd-[\d-]+$/i, '');
  // Title-case each hyphen/underscore segment.
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map(capitalize)
    .join(' ');
}

function getStats(character: Character) {
  const stats = character.base_stats as Record<string, unknown> | null;
  if (!stats) return { classKey: null, level: null, speciesKey: null };
  return {
    classKey: typeof stats.classKey === 'string' ? prettifyContentKey(stats.classKey) : null,
    level: typeof stats.level === 'number' ? stats.level : null,
    speciesKey: typeof stats.speciesKey === 'string' ? prettifyContentKey(stats.speciesKey) : null,
  };
}

/** Best-effort label for a draft. Mirrors the fallback we apply on save. */
function draftLabel(draft: CharacterDraftRow) {
  if (draft.name && draft.name.trim().length > 0) return draft.name;
  const data = draft.data as Record<string, unknown> | null;
  const characterName = typeof data?.characterName === 'string' ? data.characterName.trim() : '';
  if (characterName) return characterName;
  const classKey = typeof data?.classKey === 'string' ? prettifyContentKey(data.classKey) : null;
  const speciesKey = typeof data?.speciesKey === 'string' ? prettifyContentKey(data.speciesKey) : null;
  if (classKey || speciesKey) return [speciesKey, classKey].filter(Boolean).join(' ');
  return 'Untitled draft';
}

/** Sub-line for a draft card — surface the wizard step they're on. */
function draftSubtitle(draft: CharacterDraftRow) {
  const data = draft.data as Record<string, unknown> | null;
  const speciesKey = typeof data?.speciesKey === 'string' ? prettifyContentKey(data.speciesKey) : null;
  const classKey = typeof data?.classKey === 'string' ? prettifyContentKey(data.classKey) : null;
  const parts: string[] = [];
  if (speciesKey) parts.push(speciesKey);
  if (classKey) parts.push(classKey);
  if (parts.length > 0) return parts.join(' · ');
  return 'Just getting started';
}

export default function CharactersScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { characters, setCharacters } = useCharacterStore();
  const [drafts, setDrafts] = useState<CharacterDraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [campaignMap, setCampaignMap] = useState<Record<string, string>>({});
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<{ id: string; uri: string } | null>(null);
  const { width } = useWindowDimensions();

  const numColumns = width > 900 ? 3 : width > 560 ? 2 : 1;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      getMyCharacters(),
      listCharacterDrafts(),
      supabase
        .from('campaign_members')
        .select('character_id, campaigns(name)')
        .eq('user_id', user.id)
        .not('character_id', 'is', null),
    ]).then(async ([chars, draftsRes, memberships]) => {
      if (cancelled) return;
      if (chars.error) {
        setError('Failed to load characters.');
      } else {
        setCharacters(chars.data ?? []);
      }
      setDrafts(draftsRes.data ?? []);
      const map: Record<string, string> = {};
      type MembershipRow = { character_id: string | null; campaigns: { name: string } | null };
      for (const row of (memberships.data ?? []) as unknown as MembershipRow[]) {
        if (row.character_id && row.campaigns?.name) {
          map[row.character_id] = row.campaigns.name;
        }
      }
      // Fallback: characters linked via characters.campaign_id without a campaign_members row
      const unmappedCampaignIds = new Set<string>();
      for (const c of chars.data ?? []) {
        if (c.campaign_id && !map[c.id]) unmappedCampaignIds.add(c.campaign_id);
      }
      if (unmappedCampaignIds.size > 0) {
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, name')
          .in('id', [...unmappedCampaignIds]);
        const nameById: Record<string, string> = {};
        for (const camp of campaigns ?? []) nameById[camp.id] = camp.name;
        for (const c of chars.data ?? []) {
          if (c.campaign_id && !map[c.id] && nameById[c.campaign_id]) {
            map[c.id] = nameById[c.campaign_id];
          }
        }
      }
      setCampaignMap(map);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user, setCharacters]);

  async function handleDeleteDraft(draftId: string) {
    setDeletingDraftId(draftId);
    const { error } = await deleteCharacterDraft(draftId);
    setDeletingDraftId(null);
    if (error) return;
    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
  }

  async function handleCardCropConfirm(croppedUri: string) {
    if (!cropTarget) return;
    const charId = cropTarget.id;
    setCropTarget(null);
    const { url } = await uploadCharacterCardImage(charId, croppedUri, 'image/jpeg');
    if (url) {
      setCharacters(characters.map((c) => c.id === charId ? { ...c, avatar_card_url: url } : c));
    }
  }

  function renderItem({ item }: { item: ListItem }) {
    if (item.kind === 'new') {
      return (
        <TouchableOpacity
          style={[styles.card, styles.newCard, { flex: 1 / numColumns }]}
          onPress={() => router.push('/character/new')}
          activeOpacity={0.75}
        >
          <View style={styles.avatarArea}>
            <MaterialCommunityIcons name="plus-circle-outline" size={36} color={colors.brand} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.newCardText}>New Character</Text>
            <Text style={styles.subtitle}>Start building</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (item.kind === 'draft') {
      const draft = item.row;
      const isDeleting = deletingDraftId === draft.id;
      return (
        <TouchableOpacity
          style={[styles.card, styles.draftCard, { flex: 1 / numColumns }]}
          onPress={() => router.push(`/character/new?draftId=${draft.id}` as never)}
          activeOpacity={0.75}
        >
          <View style={styles.draftBadge}>
            <MaterialCommunityIcons name="pencil-outline" size={11} color={colors.brand} />
            <Text style={styles.draftBadgeText}>Draft</Text>
          </View>

          <View style={styles.avatarArea}>
            <MaterialCommunityIcons name="account-edit-outline" size={48} color={colors.brand + '99'} />
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.cardName} numberOfLines={1}>{draftLabel(draft)}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{draftSubtitle(draft)}</Text>

            <View style={styles.draftActionRow}>
              <Text style={styles.draftResumeText}>Tap to resume →</Text>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteDraft(draft.id);
                }}
                disabled={isDeleting}
                hitSlop={6}
                style={styles.draftDeleteBtn}
              >
                <MaterialCommunityIcons
                  name={isDeleting ? 'loading' : 'trash-can-outline'}
                  size={16}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    const char = item.row;
    const { classKey, level, speciesKey } = getStats(char);
    const campaignName = campaignMap[char.id];
    const cardImageUrl = char.avatar_card_url ?? char.avatar_url;

    const avatarUrl = (char as { avatar_url?: string | null }).avatar_url ?? null;
    return (
      <TouchableOpacity
        style={[styles.card, { flex: 1 / numColumns }]}
        onPress={() => router.push(`/character/${char.id}`)}
      >
        {/* 3:4 portrait area — matches the character sheet frame. The
            card-specific crop lives at `avatar_card_url`; falls back
            to a neutral placeholder when no portrait is uploaded. */}
        <View style={styles.avatarArea}>
          {cardImageUrl ? (
            <>
              <Image source={{ uri: cardImageUrl }} style={styles.avatarImage} resizeMode="cover" />
              {Platform.OS === 'web' && char.avatar_url && (
                <TouchableOpacity
                  style={styles.cropBtn}
                  hitSlop={4}
                  onPress={(e) => {
                    e.stopPropagation();
                    setCropTarget({ id: char.id, uri: char.avatar_url! });
                  }}
                >
                  <MaterialCommunityIcons name="crop" size={14} color="#fff" />
                </TouchableOpacity>
              )}
            </>
          ) : (
            <MaterialCommunityIcons name="account-outline" size={48} color={colors.border} />
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{char.name}</Text>

          {(classKey || speciesKey) && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {[speciesKey, classKey].filter(Boolean).join(' ')}
            </Text>
          )}

          <View style={styles.detailRow}>
            {level !== null && (
              <View style={styles.levelBadge}>
                <Text style={styles.levelText}>Lvl {level}</Text>
              </View>
            )}
            <Text style={styles.systemText}>{char.system}</Text>
          </View>

          <View style={styles.campaignRow}>
            <MaterialCommunityIcons
              name={campaignName ? 'map-marker-outline' : 'map-marker-off-outline'}
              size={13}
              color={campaignName ? colors.brand : colors.textSecondary}
            />
            <Text
              style={[styles.campaignText, !campaignName && styles.campaignTextMuted]}
              numberOfLines={1}
            >
              {campaignName ? `In: ${campaignName}` : 'Unassigned'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Drafts go between the "New" tile and completed characters so they're
  // discoverable but don't dominate the layout when there are several.
  const data: ListItem[] = [
    { kind: 'new' as const },
    ...drafts.map((row) => ({ kind: 'draft' as const, row })),
    ...characters.map((row) => ({ kind: 'character' as const, row })),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Characters</Text>
      </View>

      {loading && <ActivityIndicator color={colors.brand} style={styles.loader} />}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        key={numColumns}
        data={data}
        keyExtractor={(item) =>
          item.kind === 'new' ? '__new__' : `${item.kind}-${item.row.id}`
        }
        renderItem={renderItem}
        numColumns={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
        contentContainerStyle={styles.list}
      />

      {cropTarget ? (
        <ImageCropModal
          visible
          imageUri={cropTarget.uri}
          aspect={[2, 1]}
          usageHint="Adjust how your portrait appears on the character card."
          onCancel={() => setCropTarget(null)}
          onConfirm={handleCardCropConfirm}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  loader: { marginTop: 40 },
  error: {
    color: colors.hpDanger,
    textAlign: 'center',
    marginTop: 16,
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    gap: spacing.md,
  },
  newCard: {
    borderStyle: 'dashed' as any,
    borderColor: colors.brand + '66',
    backgroundColor: colors.brand + '0d',
  },
  newCardText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand,
  },
  // Draft card — same footprint as a regular character card but with a
  // tinted edge + badge so users can tell it apart at a glance.
  draftCard: {
    borderColor: colors.brand + '55',
    borderStyle: 'dashed' as any,
  },
  draftBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.brand + '22',
    zIndex: 1,
  },
  draftBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.brand,
  },
  draftActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  draftResumeText: {
    fontSize: 12,
    color: colors.brand,
    fontWeight: '600',
  },
  draftDeleteBtn: {
    padding: 4,
  },

  // Card — row layout. 3:4 portrait on the left, body fills the rest.
  // Capped max-width so a sparse grid (e.g. only "New Character"
  // visible) doesn't stretch a single card across the full row.
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: 480,
  },
  avatarArea: {
    // 3:4 portrait — matches the character sheet's frame.
    width: 120, height: 160,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  cropBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    padding: spacing.md,
    flex: 1, minWidth: 0,
    justifyContent: 'center',
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  levelBadge: {
    backgroundColor: colors.brand + '22',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.brand,
  },
  systemText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  campaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  campaignText: {
    fontSize: 12,
    color: colors.textPrimary,
    flex: 1,
  },
  campaignTextMuted: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
