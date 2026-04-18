import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useCurrentWorldStore } from '@vaultstone/store';
import { Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

// Sidebar lens switch. Matches handoff `.campaign-switch`: crown icon +
// "Campaign / <label>" two-line stack + chevron. Tapping opens a tiny modal
// listing linked campaigns plus a "World only" entry. The selection drives
// `current-world.lensCampaignId`, which downstream Phase 4 surfaces (Player
// View preview, orphan filtering, switch banner) read off.
export function LensDropdown() {
  const world = useCurrentWorldStore((s) => s.world);
  const linked = useCurrentWorldStore((s) => s.linkedCampaigns);
  const lensCampaignId = useCurrentWorldStore((s) => s.lensCampaignId);
  const setLens = useCurrentWorldStore((s) => s.setLens);
  const [open, setOpen] = useState(false);

  if (!world) return null;

  const selectedCampaign = lensCampaignId
    ? linked.find((c) => c.id === lensCampaignId) ?? null
    : null;
  const sublabel = selectedCampaign?.name ?? 'World only';
  const kicker = selectedCampaign ? 'Campaign' : 'Lens';

  const choose = (campaignId: string | null) => {
    setLens(campaignId);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.container,
          pressed && { backgroundColor: colors.surfaceContainerHigh },
        ]}
        disabled={linked.length === 0}
      >
        <View style={styles.crown}>
          <Icon
            name="workspace-premium"
            size={14}
            color={selectedCampaign ? colors.gm : colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <MetaLabel size="sm">{kicker}</MetaLabel>
          <Text
            variant="body-sm"
            weight="semibold"
            numberOfLines={1}
            style={{ color: colors.onSurface, marginTop: 2 }}
          >
            {sublabel}
          </Text>
        </View>
        {linked.length > 0 ? (
          <Icon name="expand-more" size={18} color={colors.outline} />
        ) : null}
      </Pressable>

      {open ? (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={styles.menuWrapper}
            >
              <View style={styles.menu}>
                <MetaLabel size="sm" tone="muted" style={styles.menuKicker}>
                  View this world as
                </MetaLabel>
                <Pressable
                  onPress={() => choose(null)}
                  style={({ pressed }) => [
                    styles.menuRow,
                    lensCampaignId === null && styles.menuRowActive,
                    pressed && { backgroundColor: colors.surfaceContainerHigh },
                  ]}
                >
                  <Icon
                    name="public"
                    size={16}
                    color={
                      lensCampaignId === null
                        ? colors.primary
                        : colors.onSurfaceVariant
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="label-md" weight="semibold">
                      World only
                    </Text>
                    <Text variant="body-sm" tone="secondary">
                      Show everything — no campaign lens applied.
                    </Text>
                  </View>
                  {lensCampaignId === null ? (
                    <Icon name="check" size={16} color={colors.primary} />
                  ) : null}
                </Pressable>

                {linked.length > 0 ? (
                  <View style={styles.menuDivider} />
                ) : null}

                {linked.map((c) => {
                  const active = lensCampaignId === c.id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => choose(c.id)}
                      style={({ pressed }) => [
                        styles.menuRow,
                        active && styles.menuRowActive,
                        pressed && {
                          backgroundColor: colors.surfaceContainerHigh,
                        },
                      ]}
                    >
                      <Icon
                        name="workspace-premium"
                        size={16}
                        color={active ? colors.primary : colors.gm}
                      />
                      <View style={{ flex: 1 }}>
                        <Text variant="label-md" weight="semibold">
                          {c.name}
                        </Text>
                        <Text variant="body-sm" tone="secondary">
                          Filter the sidebar + pages to this campaign's lens.
                        </Text>
                      </View>
                      {active ? (
                        <Icon name="check" size={16} color={colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    backgroundColor: colors.surfaceContainer,
  },
  crown: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 14, 16, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  menuWrapper: {
    width: '100%',
    maxWidth: 360,
  },
  menu: {
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '33',
    padding: spacing.sm,
    gap: spacing.xs,
  },
  menuKicker: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
  },
  menuRowActive: {
    backgroundColor: colors.primaryContainer + '22',
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.outlineVariant + '33',
    marginVertical: spacing.xs,
  },
});
