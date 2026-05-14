import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import {
  getCampaignMembers,
  getProfilesByIds,
  grantMapPermission,
  listMapPermissions,
  revokeMapPermission,
  searchProfilesByDisplayName,
  updateMap,
  updateMapPermission,
  type WorldMap,
} from '@vaultstone/api';
import { useAuthStore, useCurrentWorldStore } from '@vaultstone/store';
import type { WorldMapPermission, WorldPagePermissionLevel } from '@vaultstone/types';
import {
  Card,
  GhostButton,
  GradientButton,
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

type Props = {
  map: WorldMap;
  onClose: () => void;
  onUpdate: (patch: Partial<WorldMap>) => void;
};

type ProfileLite = { id: string; display_name: string | null; avatar_url: string | null };

type GrantRow = {
  perm: WorldMapPermission;
  profile: ProfileLite | null;
};

type CampaignPlayer = {
  userId: string;
  displayName: string;
  characterName: string | null;
  campaignId: string;
  campaignName: string;
};

export function MapShareModal({ map, onClose, onUpdate }: Props) {
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const linkedCampaigns = useCurrentWorldStore((s) => s.linkedCampaigns);

  const [rows, setRows] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [visibleToAll, setVisibleToAll] = useState(map.visible_to_players);
  const [campaignPlayers, setCampaignPlayers] = useState<CampaignPlayer[]>([]);
  const [playerGrantIds, setPlayerGrantIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (linkedCampaigns.length === 0) return;
    let cancelled = false;
    void (async () => {
      const results = await Promise.all(
        linkedCampaigns.map((c) => getCampaignMembers(c.id)),
      );
      if (cancelled) return;
      const players: CampaignPlayer[] = [];
      for (let i = 0; i < linkedCampaigns.length; i++) {
        const campaign = linkedCampaigns[i];
        for (const m of (results[i].data ?? []) as any[]) {
          if (m.user_id === myUserId) continue;
          players.push({
            userId: m.user_id,
            displayName: m.profiles?.display_name ?? 'Player',
            characterName: m.characters?.name ?? null,
            campaignId: campaign.id,
            campaignName: campaign.name,
          });
        }
      }
      setCampaignPlayers(players);
    })();
    return () => { cancelled = true; };
  }, [linkedCampaigns, myUserId]);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProfileLite | null>(null);
  const [permission, setPermission] = useState<WorldPagePermissionLevel>('view');
  const [granting, setGranting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await listMapPermissions(map.id);
    if (err || !data) {
      setLoading(false);
      setError(err?.message ?? 'Failed to load permissions.');
      return;
    }
    const userIds = Array.from(new Set(data.map((g) => g.user_id)));
    const profilesRes = await getProfilesByIds(userIds);
    const profileById = new Map<string, ProfileLite>();
    for (const p of (profilesRes.data ?? []) as ProfileLite[]) profileById.set(p.id, p);
    const next: GrantRow[] = data.map((g) => ({
      perm: g as WorldMapPermission,
      profile: profileById.get(g.user_id) ?? null,
    }));
    setRows(next);
    setPlayerGrantIds(new Set(next.map((r) => r.perm.user_id)));
    setLoading(false);
  }, [map.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await searchProfilesByDisplayName(q);
      const seen = new Set(rows.map((r) => r.perm.user_id));
      setResults(((data ?? []) as ProfileLite[]).filter((p) => !seen.has(p.id)));
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, rows]);

  async function handleGrant() {
    if (!selected || !myUserId) return;
    setGranting(true);
    setError('');
    const { error: err } = await grantMapPermission({
      mapId: map.id,
      userId: selected.id,
      permission,
      grantedBy: myUserId,
    });
    setGranting(false);
    if (err) { setError(err.message); return; }
    setSelected(null);
    setQuery('');
    setResults([]);
    setPermission('view');
    await refresh();
  }

  async function handleTogglePermission(row: GrantRow) {
    const next: WorldPagePermissionLevel = row.perm.permission === 'edit' ? 'view' : 'edit';
    setRows((prev) =>
      prev.map((r) =>
        r.perm.user_id === row.perm.user_id
          ? { ...r, perm: { ...r.perm, permission: next } }
          : r,
      ),
    );
    const { error: err } = await updateMapPermission({
      mapId: map.id,
      userId: row.perm.user_id,
      permission: next,
    });
    if (err) { setError(err.message); await refresh(); }
  }

  async function handleToggleVisibleToAll(on: boolean) {
    setVisibleToAll(on);
    onUpdate({ visible_to_players: on });
    await updateMap(map.id, { visible_to_players: on });
  }

  async function handleTogglePlayerGrant(player: CampaignPlayer) {
    if (!myUserId) return;
    const hasGrant = playerGrantIds.has(player.userId);
    if (hasGrant) {
      setPlayerGrantIds((prev) => { const n = new Set(prev); n.delete(player.userId); return n; });
      await revokeMapPermission(map.id, player.userId);
    } else {
      setPlayerGrantIds((prev) => new Set(prev).add(player.userId));
      await grantMapPermission({
        mapId: map.id,
        userId: player.userId,
        permission: 'view',
        grantedBy: myUserId,
      });
    }
    await refresh();
  }

  async function handleRevoke(row: GrantRow) {
    setRows((prev) => prev.filter((r) => r.perm.user_id !== row.perm.user_id));
    const { error: err } = await revokeMapPermission(map.id, row.perm.user_id);
    if (err) { setError(err.message); await refresh(); }
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelWrapper}>
          <Card tier="container" padding="lg" style={styles.panel}>
            <ScrollView>
              <View style={styles.header}>
                <View style={{ flex: 1 }}>
                  <MetaLabel size="sm" tone="accent">
                    Share map
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="serif-display"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    {map.label}
                  </Text>
                  <Text variant="body-sm" tone="secondary" style={{ marginTop: 4 }}>
                    Grant named users view access, or make the map visible to all
                    world members and campaign players.
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              {/* Player visibility */}
              <View style={styles.section}>
                <MetaLabel size="sm" tone="muted">
                  Player visibility
                </MetaLabel>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text variant="label-md" weight="semibold">
                      Visible to all players
                    </Text>
                    <Text variant="body-sm" tone="secondary" style={styles.toggleHelp}>
                      All world members{linkedCampaigns.length > 0 ? ' and linked-campaign players' : ''} can view this map.
                    </Text>
                  </View>
                  <Switch
                    value={visibleToAll}
                    onValueChange={handleToggleVisibleToAll}
                    thumbColor={visibleToAll ? colors.player : colors.outline}
                    trackColor={{ false: colors.outlineVariant, true: colors.player + '55' }}
                  />
                </View>

                {!visibleToAll && campaignPlayers.length > 0 ? (
                  <View style={{ gap: 2, marginTop: spacing.sm }}>
                    <Text variant="label-sm" style={{ color: colors.outline, marginBottom: 4 }}>
                      Or grant to specific players:
                    </Text>
                    {(() => {
                      const grouped = new Map<string, { name: string; players: CampaignPlayer[] }>();
                      for (const p of campaignPlayers) {
                        if (!grouped.has(p.campaignId)) grouped.set(p.campaignId, { name: p.campaignName, players: [] });
                        grouped.get(p.campaignId)!.players.push(p);
                      }
                      return Array.from(grouped.entries()).map(([campId, { name, players }]) => (
                        <View key={campId}>
                          {grouped.size > 1 ? (
                            <Text variant="label-sm" uppercase style={{ color: colors.outline, letterSpacing: 1, fontSize: 10, marginTop: spacing.xs, marginBottom: 2 }}>
                              {name}
                            </Text>
                          ) : null}
                          {players.map((p) => {
                            const granted = playerGrantIds.has(p.userId);
                            return (
                              <Pressable
                                key={p.userId}
                                onPress={() => handleTogglePlayerGrant(p)}
                                style={styles.playerRow}
                              >
                                <Icon
                                  name={granted ? 'check-circle' : 'radio-button-unchecked'}
                                  size={18}
                                  color={granted ? colors.player : colors.outline}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text variant="label-md" weight="semibold" style={{ color: colors.onSurface }}>
                                    {p.displayName}
                                  </Text>
                                  {p.characterName ? (
                                    <Text variant="label-sm" style={{ color: colors.onSurfaceVariant }}>
                                      {p.characterName}
                                    </Text>
                                  ) : null}
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      ));
                    })()}
                  </View>
                ) : null}
              </View>

              <View style={styles.section}>
                <MetaLabel size="sm" tone="muted">
                  Add someone
                </MetaLabel>
                <Input
                  value={query}
                  onChangeText={(t) => {
                    setQuery(t);
                    setSelected(null);
                  }}
                  placeholder="Search by display name"
                />
                {selected ? (
                  <View style={styles.selectedRow}>
                    <View style={{ flex: 1 }}>
                      <Text variant="label-md" weight="semibold">
                        {selected.display_name ?? 'Unnamed user'}
                      </Text>
                      <Text variant="body-sm" tone="secondary">
                        Ready to grant access
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => { setSelected(null); setQuery(''); }}
                      style={styles.clearBtn}
                    >
                      <Icon name="close" size={16} color={colors.onSurfaceVariant} />
                    </Pressable>
                  </View>
                ) : query.trim().length >= 2 ? (
                  <View style={styles.results}>
                    {searching ? (
                      <View style={styles.resultsHint}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text variant="body-sm" tone="secondary">Searching...</Text>
                      </View>
                    ) : results.length === 0 ? (
                      <Text variant="body-sm" tone="secondary" style={styles.resultsHint}>
                        No matches.
                      </Text>
                    ) : (
                      results.map((p) => (
                        <Pressable
                          key={p.id}
                          onPress={() => setSelected(p)}
                          style={styles.resultRow}
                        >
                          <Icon name="person" size={18} color={colors.onSurfaceVariant} />
                          <Text variant="label-md" weight="semibold" style={{ flex: 1 }}>
                            {p.display_name ?? 'Unnamed user'}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}

                {selected ? (
                  <>
                    <View style={styles.permRow}>
                      {(['view', 'edit'] as const).map((level) => {
                        const isSelected = permission === level;
                        return (
                          <Pressable
                            key={level}
                            onPress={() => setPermission(level)}
                            style={[styles.permChip, isSelected && styles.permChipActive]}
                          >
                            <Text
                              variant="label-md"
                              uppercase
                              weight="semibold"
                              style={{
                                color: isSelected ? colors.primary : colors.onSurfaceVariant,
                                letterSpacing: 1,
                              }}
                            >
                              {level}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <GradientButton
                      label="Grant access"
                      onPress={handleGrant}
                      loading={granting}
                    />
                  </>
                ) : null}
              </View>

              <View style={styles.section}>
                <MetaLabel size="sm" tone="muted">
                  Who has access
                </MetaLabel>
                {loading ? (
                  <View style={styles.loadingBlock}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : rows.length === 0 ? (
                  <Text variant="body-sm" tone="secondary" style={{ paddingVertical: spacing.sm }}>
                    {visibleToAll
                      ? 'All world members and linked-campaign players can view this map.'
                      : 'Only the world owner can see this map. Grant access below or toggle player visibility above.'}
                  </Text>
                ) : (
                  rows.map((row) => (
                    <View key={row.perm.user_id} style={styles.grantRow}>
                      <View style={{ flex: 1 }}>
                        <Text variant="label-md" weight="semibold">
                          {row.profile?.display_name ?? 'Unnamed user'}
                        </Text>
                      </View>
                      <View style={styles.grantActions}>
                        <Pressable
                          onPress={() => handleTogglePermission(row)}
                          style={[
                            styles.permToggleChip,
                            row.perm.permission === 'edit' && styles.permToggleChipEdit,
                          ]}
                          accessibilityLabel={
                            row.perm.permission === 'edit' ? 'Switch to view only' : 'Switch to edit'
                          }
                        >
                          <Icon
                            name={row.perm.permission === 'edit' ? 'edit' : 'visibility'}
                            size={12}
                            color={row.perm.permission === 'edit' ? colors.primary : colors.onSurfaceVariant}
                          />
                          <Text
                            variant="label-sm"
                            uppercase
                            weight="semibold"
                            style={{
                              color: row.perm.permission === 'edit' ? colors.primary : colors.onSurfaceVariant,
                              fontSize: 10,
                              letterSpacing: 1,
                            }}
                          >
                            {row.perm.permission}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleRevoke(row)}
                          style={styles.grantAction}
                          accessibilityLabel="Revoke access"
                        >
                          <Icon name="delete-outline" size={16} color={colors.hpDanger} />
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </View>

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                <GhostButton label="Done" onPress={onClose} />
              </View>
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  panelWrapper: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
  },
  panel: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  section: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant + '33',
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    backgroundColor: colors.primaryContainer + '22',
    gap: spacing.sm,
  },
  clearBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  results: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  resultsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  permRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  permChip: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  permChipActive: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '66',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleHelp: {
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  loadingBlock: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  grantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant + '22',
  },
  grantActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  grantAction: {
    padding: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  permToggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  permToggleChipEdit: {
    backgroundColor: colors.primaryContainer + '33',
    borderColor: colors.primary + '55',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
  },
});
