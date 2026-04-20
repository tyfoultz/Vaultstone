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
  getProfilesByIds,
  grantPagePermission,
  listPagePermissionsForAncestors,
  revokePagePermission,
  searchProfilesByDisplayName,
  updatePagePermission,
} from '@vaultstone/api';
import { useAuthStore, usePagesStore } from '@vaultstone/store';
import type {
  WorldPage,
  WorldPagePermission,
  WorldPagePermissionLevel,
} from '@vaultstone/types';
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
  page: WorldPage;
  onClose: () => void;
};

type ProfileLite = { id: string; display_name: string | null; avatar_url: string | null };

type GrantRow = {
  perm: WorldPagePermission;
  profile: ProfileLite | null;
  sourcePageId: string; // the page the grant is attached to
  inherited: boolean;   // true if sourcePageId !== props.page.id
  sourceTitle: string | null; // ancestor title when inherited
};

// Walk parent_page_id from `page` up to the root, returning ids in
// order [self, parent, grandparent, …]. Capped at 8 to match the
// server-side recursive CTE in `effective_page_permission`.
function ancestorIds(allPages: WorldPage[] | undefined, startId: string): string[] {
  const out: string[] = [];
  if (!allPages) return [startId];
  const byId = new Map(allPages.map((p) => [p.id, p] as const));
  let cur: WorldPage | undefined = byId.get(startId);
  let depth = 0;
  while (cur && depth < 9) {
    out.push(cur.id);
    if (!cur.parent_page_id) break;
    cur = byId.get(cur.parent_page_id);
    depth += 1;
  }
  return out;
}

export function ShareModal({ page, onClose }: Props) {
  const myUserId = useAuthStore((s) => s.user?.id ?? null);
  const allPages = usePagesStore((s) => s.byWorldId[page.world_id]);
  const titlesById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of allPages ?? []) m.set(p.id, p.title);
    return m;
  }, [allPages]);

  const [rows, setRows] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add-grant form state.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProfileLite | null>(null);
  const [permission, setPermission] = useState<WorldPagePermissionLevel>('view');
  const [cascade, setCascade] = useState(false);
  const [granting, setGranting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    const ids = ancestorIds(allPages, page.id);
    const { data, error: err } = await listPagePermissionsForAncestors(ids);
    if (err || !data) {
      setLoading(false);
      setError(err?.message ?? 'Failed to load permissions.');
      return;
    }
    const userIds = Array.from(new Set(data.map((g) => g.user_id)));
    const profilesRes = await getProfilesByIds(userIds);
    const profileById = new Map<string, ProfileLite>();
    for (const p of (profilesRes.data ?? []) as ProfileLite[]) profileById.set(p.id, p);
    const next: GrantRow[] = data
      .filter((g) => g.page_id === page.id || g.cascade === true)
      .map((g) => {
        const inherited = g.page_id !== page.id;
        return {
          perm: g as WorldPagePermission,
          profile: profileById.get(g.user_id) ?? null,
          sourcePageId: g.page_id,
          inherited,
          sourceTitle: inherited ? (titlesById.get(g.page_id) ?? 'ancestor page') : null,
        };
      });
    // Sort: direct grants first, then inherited.
    next.sort((a, b) => Number(a.inherited) - Number(b.inherited));
    setRows(next);
    setLoading(false);
  }, [allPages, page.id, titlesById]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Debounced grantee search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await searchProfilesByDisplayName(q);
      const seen = new Set(rows.filter((r) => !r.inherited).map((r) => r.perm.user_id));
      setResults(((data ?? []) as ProfileLite[]).filter((p) => !seen.has(p.id)));
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, rows]);

  async function handleGrant() {
    if (!selected || !myUserId) return;
    setGranting(true);
    setError('');
    const { error: err } = await grantPagePermission({
      pageId: page.id,
      userId: selected.id,
      permission,
      cascade,
      grantedBy: myUserId,
    });
    setGranting(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSelected(null);
    setQuery('');
    setResults([]);
    setPermission('view');
    setCascade(false);
    await refresh();
  }

  async function handleTogglePermission(row: GrantRow) {
    if (row.inherited) return;
    const next: WorldPagePermissionLevel = row.perm.permission === 'edit' ? 'view' : 'edit';
    // Optimistic.
    setRows((prev) =>
      prev.map((r) =>
        r.perm.user_id === row.perm.user_id && r.sourcePageId === row.sourcePageId
          ? { ...r, perm: { ...r.perm, permission: next } }
          : r,
      ),
    );
    const { error: err } = await updatePagePermission({
      pageId: page.id,
      userId: row.perm.user_id,
      permission: next,
    });
    if (err) {
      setError(err.message);
      await refresh();
    }
  }

  async function handleToggleCascade(row: GrantRow) {
    if (row.inherited) return;
    const next = !row.perm.cascade;
    setRows((prev) =>
      prev.map((r) =>
        r.perm.user_id === row.perm.user_id && r.sourcePageId === row.sourcePageId
          ? { ...r, perm: { ...r.perm, cascade: next } }
          : r,
      ),
    );
    const { error: err } = await updatePagePermission({
      pageId: page.id,
      userId: row.perm.user_id,
      cascade: next,
    });
    if (err) {
      setError(err.message);
      await refresh();
    }
  }

  async function handleRevoke(row: GrantRow) {
    if (row.inherited) return;
    setRows((prev) =>
      prev.filter(
        (r) => !(r.perm.user_id === row.perm.user_id && r.sourcePageId === row.sourcePageId),
      ),
    );
    const { error: err } = await revokePagePermission(page.id, row.perm.user_id);
    if (err) {
      setError(err.message);
      await refresh();
    }
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
                    Share page
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="serif-display"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    {page.title}
                  </Text>
                  <Text variant="body-sm" tone="secondary" style={{ marginTop: 4 }}>
                    Grant named users view or edit access, even if they aren't
                    on a linked campaign. Cascade extends the grant to every
                    nested page.
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
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
                      onPress={() => {
                        setSelected(null);
                        setQuery('');
                      }}
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
                        <Text variant="body-sm" tone="secondary">
                          Searching…
                        </Text>
                      </View>
                    ) : results.length === 0 ? (
                      <Text
                        variant="body-sm"
                        tone="secondary"
                        style={styles.resultsHint}
                      >
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
                            style={[
                              styles.permChip,
                              isSelected && styles.permChipActive,
                            ]}
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
                    <View style={styles.toggleRow}>
                      <View style={{ flex: 1, paddingRight: spacing.md }}>
                        <Text variant="label-md" weight="semibold">
                          Cascade to nested pages
                        </Text>
                        <Text variant="body-sm" tone="secondary" style={styles.toggleHelp}>
                          Also grant this access to every page nested under
                          "{page.title}".
                        </Text>
                      </View>
                      <Switch
                        value={cascade}
                        onValueChange={setCascade}
                        thumbColor={cascade ? colors.primary : colors.outline}
                        trackColor={{
                          false: colors.outlineVariant,
                          true: colors.primaryContainer,
                        }}
                      />
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
                    Only the world owner and linked-campaign members can see this page.
                  </Text>
                ) : (
                  rows.map((row) => (
                    <View
                      key={`${row.sourcePageId}:${row.perm.user_id}`}
                      style={styles.grantRow}
                    >
                      <View style={{ flex: 1 }}>
                        <Text variant="label-md" weight="semibold">
                          {row.profile?.display_name ?? 'Unnamed user'}
                        </Text>
                        <View style={styles.sourceRow}>
                          <View style={[styles.sourceChip, row.inherited && styles.sourceChipInherited]}>
                            <Text
                              variant="label-md"
                              uppercase
                              weight="semibold"
                              style={{
                                color: row.inherited ? colors.onSurfaceVariant : colors.primary,
                                fontSize: 10,
                                letterSpacing: 1,
                              }}
                            >
                              {row.inherited ? `From ${row.sourceTitle}` : 'Direct'}
                            </Text>
                          </View>
                          <View style={styles.sourceChip}>
                            <Text
                              variant="label-md"
                              uppercase
                              weight="semibold"
                              style={{
                                color:
                                  row.perm.permission === 'edit'
                                    ? colors.primary
                                    : colors.onSurfaceVariant,
                                fontSize: 10,
                                letterSpacing: 1,
                              }}
                            >
                              {row.perm.permission}
                            </Text>
                          </View>
                          {row.perm.cascade ? (
                            <View style={styles.sourceChip}>
                              <Text
                                variant="label-md"
                                uppercase
                                weight="semibold"
                                style={{
                                  color: colors.secondary,
                                  fontSize: 10,
                                  letterSpacing: 1,
                                }}
                              >
                                Cascades
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {row.inherited ? null : (
                        <View style={styles.grantActions}>
                          <Pressable
                            onPress={() => handleTogglePermission(row)}
                            style={styles.grantAction}
                            accessibilityLabel={
                              row.perm.permission === 'edit'
                                ? 'Switch to view only'
                                : 'Switch to edit'
                            }
                          >
                            <Icon
                              name={row.perm.permission === 'edit' ? 'edit' : 'visibility'}
                              size={16}
                              color={colors.onSurfaceVariant}
                            />
                          </Pressable>
                          <Pressable
                            onPress={() => handleToggleCascade(row)}
                            style={styles.grantAction}
                            accessibilityLabel={
                              row.perm.cascade ? 'Disable cascade' : 'Enable cascade'
                            }
                          >
                            <Icon
                              name={row.perm.cascade ? 'unfold-more' : 'unfold-less'}
                              size={16}
                              color={
                                row.perm.cascade ? colors.secondary : colors.onSurfaceVariant
                              }
                            />
                          </Pressable>
                          <Pressable
                            onPress={() => handleRevoke(row)}
                            style={styles.grantAction}
                            accessibilityLabel="Revoke access"
                          >
                            <Icon name="delete-outline" size={16} color={colors.hpDanger} />
                          </Pressable>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>

              {error ? (
                <Text
                  variant="body-sm"
                  style={{ color: colors.hpDanger, marginTop: spacing.md }}
                >
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
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 4,
  },
  sourceChip: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
    backgroundColor: colors.surfaceContainerHigh,
  },
  sourceChipInherited: {
    borderStyle: 'dashed',
  },
  grantActions: {
    flexDirection: 'row',
    gap: 4,
  },
  grantAction: {
    padding: spacing.xs + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
