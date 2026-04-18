import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { movePage } from '@vaultstone/api';
import { usePagesStore } from '@vaultstone/store';
import type { WorldPage } from '@vaultstone/types';
import { Icon, Text, colors, spacing } from '@vaultstone/ui';

type Props = {
  page: WorldPage;
  onDismiss?: () => void;
};

// Renders above a page's body when the page has a `parent_page_id` but the
// parent is no longer in the local pages cache (soft-deleted or unlinked).
// "Re-link" detaches the parent pointer so the page reattaches to the
// section root — a minimal-risk recovery pass. Phase 7a will replace this
// with a proper picker (re-link / re-home / dismiss UX).
//
// Reuses the `.takeover-banner` chrome from the handoff (3px left border +
// tinted surface) with the `hpDanger` crimson accent.
export function OrphanBanner({ page, onDismiss }: Props) {
  const updatePageInStore = usePagesStore((s) => s.updatePage);
  const [relinking, setRelinking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleRelink() {
    setRelinking(true);
    const { error } = await movePage({
      pageId: page.id,
      newSectionId: page.section_id,
      newParentId: null,
      newSortOrder: page.sort_order,
    });
    setRelinking(false);
    if (error) return;
    updatePageInStore(page.id, { parent_page_id: null });
  }

  return (
    <View style={styles.root}>
      <Icon name="link-off" size={14} color={colors.hpDanger} />
      <View style={{ flex: 1 }}>
        <Text variant="label-md" weight="semibold" style={{ color: colors.hpDanger }}>
          This page is orphaned
        </Text>
        <Text variant="body-sm" tone="secondary">
          Its parent page has been deleted or unlinked. Re-link to move it
          back under its section root, or dismiss this notice.
        </Text>
      </View>
      <Pressable onPress={handleRelink} style={styles.actionBtn} disabled={relinking}>
        <Text
          variant="label-md"
          uppercase
          weight="semibold"
          style={{ color: colors.hpDanger, letterSpacing: 1, fontSize: 11 }}
        >
          {relinking ? 'Re-linking…' : 'Re-link'}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setDismissed(true);
          if (onDismiss) onDismiss();
        }}
        style={styles.dismissBtn}
      >
        <Icon name="close" size={16} color={colors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.dangerContainer + '55',
    borderLeftWidth: 3,
    borderLeftColor: colors.hpDanger,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.hpDanger + '33',
  },
  actionBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.hpDanger + '55',
  },
  dismissBtn: {
    padding: spacing.xs,
  },
});
