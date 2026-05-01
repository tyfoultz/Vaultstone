import { ScrollView, View, StyleSheet, useWindowDimensions } from 'react-native';
import {
  colors, spacing, radius,
  Card, Chip, MetaLabel, Text, ScreenHeader, Icon, GhostButton,
} from '@vaultstone/ui';
import { dnd5eSystem, customSystem } from '@vaultstone/systems';
import { getSrdCounts } from '@vaultstone/content';

// Stays in lockstep with the bundled `GameSystemDefinition` exports — when a
// new system is added there, surface it here too.
const BUNDLED_SYSTEMS = [dnd5eSystem, customSystem];

export default function GameSystemsScreen() {
  const { width } = useWindowDimensions();
  const numColumns = width > 1100 ? 2 : 1;
  const srd = getSrdCounts();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <ScreenHeader
        title="Game Systems"
        subtitle="Manage rulesets, official source content, and your homebrew library."
      />

      {/* ── Available Systems ─────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text variant="title-md" family="headline" weight="bold" style={styles.sectionTitle}>
            Available Systems
          </Text>
          <MetaLabel size="sm">{BUNDLED_SYSTEMS.length} bundled</MetaLabel>
        </View>

        <View style={[styles.grid, { gap: spacing.md }]}>
          {BUNDLED_SYSTEMS.map((sys) => {
            const isDnd = sys.id === 'dnd5e';
            return (
              <Card
                key={sys.id}
                tier="container"
                padding="md"
                style={numColumns === 2 ? styles.gridItemHalf : styles.gridItemFull}
              >
                <View style={styles.cardHead}>
                  <View style={styles.cardHeadIcon}>
                    <Icon
                      name={isDnd ? 'casino' : 'extension'}
                      size={22}
                      color={colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
                      {sys.displayName}
                    </Text>
                    <MetaLabel size="sm">v{sys.version}</MetaLabel>
                  </View>
                  <Chip label={sys.isBundled ? 'Bundled' : 'Custom'} variant="accent" />
                </View>

                {isDnd ? (
                  <View style={styles.metaList}>
                    <Stat label="Species" value={srd.species} />
                    <Stat label="Classes" value={srd.classes} />
                    <Stat label="Backgrounds" value={srd.backgrounds} />
                    <Stat label="Sheet sections" value={sys.sheetSections.length} />
                  </View>
                ) : (
                  <Text variant="body-sm" family="body" style={styles.bodyMuted}>
                    Open template — bring your own attributes, resources, and sheet
                    sections. No bundled SRD content.
                  </Text>
                )}

                <View style={styles.licenseRow}>
                  <Icon name="info-outline" size={13} color={colors.outline} />
                  <Text variant="body-sm" family="body" style={styles.licenseText}>
                    {sys.license === 'CC-BY-4.0'
                      ? 'CC-BY 4.0 — attribution required when displaying SRD content.'
                      : 'Custom license — defined per pack.'}
                  </Text>
                </View>
              </Card>
            );
          })}
        </View>
      </View>

      {/* ── Homebrew Packs ────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text variant="title-md" family="headline" weight="bold" style={styles.sectionTitle}>
            Homebrew Packs
          </Text>
        </View>
        <Card tier="low" padding="lg" style={styles.emptyCard}>
          <Icon name="auto-fix-high" size={28} color={colors.outline} />
          <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurfaceVariant }}>
            No packs yet
          </Text>
          <Text variant="body-sm" family="body" style={[styles.bodyMuted, { textAlign: 'center', maxWidth: 480 }]}>
            Bundle your custom species, classes, backgrounds, items, or spells into a
            pack and toggle it on per campaign. Coming in the next phase.
          </Text>
          <GhostButton label="Create a pack" icon="add" disabled />
        </Card>
      </View>

      {/* ── Imported Books ────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text variant="title-md" family="headline" weight="bold" style={styles.sectionTitle}>
            Imported Books
          </Text>
        </View>
        <Card tier="low" padding="lg" style={styles.emptyCard}>
          <Icon name="menu-book" size={28} color={colors.outline} />
          <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurfaceVariant }}>
            Books live with your campaigns today
          </Text>
          <Text variant="body-sm" family="body" style={[styles.bodyMuted, { textAlign: 'center', maxWidth: 520 }]}>
            PDFs you upload to a campaign stay device-local for legal reasons. The
            next phase moves them up to your library so you can import once and
            reference them from any campaign.
          </Text>
        </Card>
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text variant="title-md" family="headline" weight="bold" style={{ color: colors.onSurface }}>
        {value}
      </Text>
      <MetaLabel size="sm">{label}</MetaLabel>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm + 4,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.onSurface,
    letterSpacing: -0.3,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItemFull: { flexBasis: '100%', flexGrow: 1 },
  gridItemHalf: { flexBasis: '48%', flexGrow: 1, minWidth: 360 },

  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  cardHeadIcon: {
    width: 40, height: 40,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryContainer + '44',
    alignItems: 'center', justifyContent: 'center',
  },

  metaList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant + '88',
    marginBottom: spacing.sm,
  },
  stat: { gap: 2 },

  bodyMuted: {
    color: colors.onSurfaceVariant,
    lineHeight: 20,
  },

  licenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  licenseText: {
    color: colors.outline,
    flex: 1,
    fontSize: 11,
  },

  emptyCard: {
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.xl,
  },
});
