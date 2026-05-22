// "Members" card on the campaign page. Different surface from the
// Party card: this is the *roster* — who's in the campaign and which
// characters each member owns under it. The Party card focuses on
// at-a-glance vitals for the currently active characters; this one
// gives the full membership view, including the DM and any benched
// (inactive) characters with an explicit chip.
//
// Data flow: parent passes the `campaign_members` array (already
// loaded for the Party card) plus a separate fetch of all characters
// whose `campaign_id` points at this campaign. We group characters
// under each member by `characters.user_id`, then emit one row per
// member with their characters inline.

import { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { useSplitPaneStore } from '@vaultstone/store';
import { Card, GhostButton, MetaLabel, Text, colors, spacing, radius, fonts } from '@vaultstone/ui';
import type { Dnd5eStats, CharacterSettings } from '@vaultstone/types';
import { useResolvedContentLabels } from './useResolvedContentLabels';

type Member = {
  user_id: string;
  role: 'gm' | 'player' | 'co_gm';
  character_id: string | null;
  profiles: { id: string; display_name: string | null } | null;
};

type CampaignCharacter = {
  id: string;
  user_id: string;
  name: string;
  base_stats: unknown;
};

type Props = {
  /** Campaign the roster belongs to. Used to scope homebrew-content name
   *  resolution so `homebrew_<uuid>` species/class keys render as the
   *  user's actual content name instead of the row id. */
  campaignId: string;
  members: Member[];
  characters: CampaignCharacter[];
  currentUserId: string | null;
  /** DM-only — when set, renders a "Manage members" button in the
   *  card header that opens the join-code + member-management modal.
   *  Moved here from the Party card since membership ops belong with
   *  the roster surface, not the at-a-glance vitals surface. */
  isDM?: boolean;
  onManageMembers?: () => void;
  /** When true, render without the wrapping Card chrome so this
   *  component can sit inside another Card (e.g. as a section of
   *  the "About this Campaign" card). The header eyebrow stays in
   *  place; the parent owns the surface. */
  nested?: boolean;
};

const ROLE_LABEL: Record<Member['role'], string> = {
  gm: 'DM',
  co_gm: 'Co-DM',
  player: 'Player',
};

/** Two-letter initials for the member's avatar fallback. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function CampaignMembersCard({
  campaignId, members, characters, currentUserId, isDM, onManageMembers, nested,
}: Props) {
  const playerCount = members.filter((m) => m.role !== 'gm').length;
  // Group characters by owner so we can render them under each member.
  // A member with zero linked characters still gets a row.
  const charsByUser = useMemo(() => {
    const map = new Map<string, CampaignCharacter[]>();
    for (const c of characters) {
      const list = map.get(c.user_id) ?? [];
      list.push(c);
      map.set(c.user_id, list);
    }
    return map;
  }, [characters]);

  // DM(s) first, then players. Stable within each group by joined_at
  // order (already applied upstream).
  const sortedMembers = useMemo(() => {
    const rank: Record<Member['role'], number> = { gm: 0, co_gm: 1, player: 2 };
    return [...members].sort((a, b) => rank[a.role] - rank[b.role]);
  }, [members]);

  const Outer = nested ? View : Card;
  const outerProps = nested
    ? { style: { gap: spacing.sm } as const }
    : { tier: 'container' as const, padding: 'md' as const, style: { gap: spacing.sm } as const };

  return (
    <Outer {...outerProps}>
      <View style={s.headRow}>
        <View style={s.head}>
          <MetaLabel size="sm">Members</MetaLabel>
          <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface, marginTop: 2 }}>
            {playerCount} {playerCount === 1 ? 'player' : 'players'}
          </Text>
        </View>
        {isDM && onManageMembers ? (
          <GhostButton
            label="Manage members"
            icon="group"
            onPress={onManageMembers}
          />
        ) : null}
      </View>

      <View style={s.list}>
        {sortedMembers.map((m) => {
          const ownedChars = charsByUser.get(m.user_id) ?? [];
          const isYou = m.user_id === currentUserId;
          const displayName = m.profiles?.display_name ?? 'Unknown';
          return (
            <View key={m.user_id} style={s.memberBlock}>
              <View style={s.memberRow}>
                <View style={s.avatar}>
                  <Text family="body" weight="bold" style={s.avatarText}>
                    {initials(displayName)}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.nameRow}>
                    <Text variant="body-sm" family="body" weight="semibold" style={{ color: colors.onSurface }}>
                      {displayName}
                      {isYou ? (
                        <Text variant="body-sm" style={{ color: colors.outline }}>{' '}(you)</Text>
                      ) : null}
                    </Text>
                    <View style={[s.roleChip, m.role === 'gm' && s.roleChipDm]}>
                      <Text style={[s.roleChipText, m.role === 'gm' && s.roleChipTextDm]}>
                        {ROLE_LABEL[m.role]}
                      </Text>
                    </View>
                  </View>
                  {ownedChars.length === 0 ? (
                    <Text variant="label-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
                      No characters linked
                    </Text>
                  ) : null}
                </View>
              </View>

              {ownedChars.length > 0 ? (
                <View style={s.charsList}>
                  {ownedChars.map((c) => (
                    <CharacterRow key={c.id} character={c} campaignId={campaignId} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </Outer>
  );
}

function CharacterRow({ character, campaignId }: { character: CampaignCharacter; campaignId: string }) {
  const openSplit = useSplitPaneStore((s) => s.openSplit);
  const stats = character.base_stats as Dnd5eStats | null;
  const { speciesLabel, classLabel } = useResolvedContentLabels(stats, { campaignId });
  const level = stats?.level ?? null;
  const settings = stats?.settings as CharacterSettings | undefined;
  const isInactive = settings?.active === false;

  const meta = [
    speciesLabel,
    classLabel ? (level ? `${classLabel} ${level}` : classLabel) : null,
  ].filter(Boolean).join(' · ');

  // Tapping a character row from inside the campaign view opens the
  // sheet in the campaign's split pane (web + native, the campaign
  // route swaps to a mobile-tab layout). The standalone navigate
  // path is kept as a fallback for any future caller that uses the
  // row outside the campaign context.
  function handleOpen() {
    openSplit({ kind: 'character', characterId: character.id });
  }

  return (
    <Pressable
      onPress={handleOpen}
      style={({ pressed }) => [
        s.charRow,
        pressed ? { opacity: 0.85 } : null,
        isInactive ? s.charRowInactive : null,
      ]}
    >
      <View style={s.charBullet} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.charNameRow}>
          <Text
            variant="body-sm"
            family="body"
            weight="semibold"
            style={[
              { color: colors.onSurface },
              isInactive ? { color: colors.onSurfaceVariant } : null,
            ]}
          >
            {character.name}
          </Text>
          {isInactive ? (
            <View style={s.inactiveChip}>
              <Text style={s.inactiveChipText}>INACTIVE</Text>
            </View>
          ) : null}
        </View>
        {meta ? (
          <Text variant="label-sm" family="body" style={{ color: colors.onSurfaceVariant, marginTop: 1 }}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  head: { gap: 2 },
  list: { gap: spacing.sm + 4 },

  memberBlock: { gap: 6 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onPrimary, fontSize: 12 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  roleChipDm: {
    borderColor: 'rgba(230,162,85,0.45)',
    backgroundColor: 'rgba(230,162,85,0.12)',
  },
  roleChipText: {
    fontFamily: fonts.label,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.onSurfaceVariant,
  },
  roleChipTextDm: { color: colors.gm },

  charsList: {
    paddingLeft: 32 + spacing.sm, // align with text column after the avatar
    gap: 4,
  },
  charRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  charRowInactive: {
    opacity: 0.65,
    borderStyle: 'dashed' as const,
  },
  charBullet: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  charNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  inactiveChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: 'transparent',
  },
  inactiveChipText: {
    fontFamily: fonts.label,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.outline,
  },
});
