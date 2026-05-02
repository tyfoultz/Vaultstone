import { ScrollView, View, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import {
  colors, spacing, radius,
  Card, Chip, ContentWidth, MetaLabel, Text, ScreenHeader, Icon,
} from '@vaultstone/ui';
import { dnd5e2014System, dnd5e2024System, customSystem } from '@vaultstone/systems';
import { getSrdCountsByVersion } from '@vaultstone/content';

// Stays in lockstep with the bundled `GameSystemDefinition` exports — when a
// new system is added there, surface it here too.
const BUNDLED_SYSTEMS = [dnd5e2024System, dnd5e2014System, customSystem];

export default function GameSystemsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const numColumns = width > 1100 ? 2 : 1;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surfaceCanvas }}>
      <ScreenHeader
        title="Game Systems"
        subtitle="Manage rulesets, official source content, and your homebrew library."
      />

      <ContentWidth size="wide">

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
            const counts = sys.srdVersion ? getSrdCountsByVersion(sys.srdVersion) : null;
            const iconName = sys.id.startsWith('dnd5e') ? 'casino' : 'extension';
            return (
              <Pressable
                key={sys.id}
                onPress={() => router.push(`/game-systems/${sys.id}` as Href)}
                style={({ pressed, hovered }: any) => [
                  numColumns === 2 ? styles.gridItemHalf : styles.gridItemFull,
                  { transform: [{ scale: pressed ? 0.995 : 1 }], opacity: pressed ? 0.92 : 1 },
                  hovered && styles.cardHovered,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Open ${sys.displayName}`}
              >
                <Card tier="container" padding="md">
                  <View style={styles.cardHead}>
                    <View style={styles.cardHeadIcon}>
                      <Icon name={iconName} size={22} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text variant="title-sm" family="headline" weight="bold" style={{ color: colors.onSurface }}>
                        {sys.displayName}
                      </Text>
                      <MetaLabel size="sm">v{sys.version}</MetaLabel>
                    </View>
                    <Chip label={sys.isBundled ? 'Bundled' : 'Custom'} variant="accent" />
                    <Icon name="chevron-right" size={20} color={colors.outline} />
                  </View>

                  {counts ? (
                    <View style={styles.metaList}>
                      <Stat label="Species"     value={counts.species} />
                      <Stat label="Classes"     value={counts.classes} />
                      <Stat label="Subclasses"  value={counts.subclasses} />
                      <Stat label="Backgrounds" value={counts.backgrounds} />
                      <Stat label="Spells"      value={counts.spells} />
                      <Stat label="Feats"       value={counts.feats} />
                      <Stat label="Conditions"  value={counts.conditions} />
                      <Stat label="Items"       value={counts.items} />
                      <Stat label="Monsters"    value={counts.creatures} />
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
              </Pressable>
            );
          })}
        </View>
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

      </ContentWidth>
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

  cardHovered: {
    transform: [{ scale: 1.005 }],
  },

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
