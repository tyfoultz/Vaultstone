import { Pressable, StyleSheet, View } from 'react-native';
import { listTemplates, type TemplateSummary } from '@vaultstone/content';
import type { AccentToken, TemplateKey } from '@vaultstone/types';
import { Card, Icon, MetaLabel, Text, colors, radius, spacing } from '@vaultstone/ui';

const ACCENT_TINT: Record<AccentToken, string> = {
  primary: colors.primary,
  player: colors.player,
  gm: colors.gm,
  cosmic: colors.cosmic,
  danger: colors.hpDanger,
};

const MATERIAL_ICON: Record<string, string> = {
  'map-pin': 'place',
  skull: 'dangerous',
  user: 'person',
  shield: 'shield',
  book: 'auto-stories',
  'file-text': 'article',
};

type Props = {
  value: TemplateKey;
  onChange: (key: TemplateKey) => void;
};

export function SectionTemplatePicker({ value, onChange }: Props) {
  const templates: TemplateSummary[] = listTemplates();
  return (
    <View style={styles.grid}>
      {templates.map((t) => {
        const tint = ACCENT_TINT[t.accentToken];
        const selected = value === t.key;
        const materialName = MATERIAL_ICON[t.icon] ?? 'article';
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={styles.cell}
          >
            <Card
              tier="high"
              padding="md"
              style={[
                styles.card,
                selected && { borderColor: tint + '99', backgroundColor: tint + '12' },
              ]}
            >
              <View style={[styles.iconTile, { backgroundColor: tint + '22', borderColor: tint + '55' }]}>
                <Icon
                  name={materialName as React.ComponentProps<typeof Icon>['name']}
                  size={20}
                  color={tint}
                />
              </View>
              <Text variant="title-sm" family="serif-display" weight="semibold" style={{ marginTop: spacing.sm }}>
                {t.label}
              </Text>
              <Text
                variant="body-sm"
                tone="secondary"
                style={{ marginTop: 2, color: colors.onSurfaceVariant }}
              >
                {t.description}
              </Text>
              <MetaLabel size="sm" style={{ marginTop: spacing.sm }}>
                {t.defaultSectionView} view
              </MetaLabel>
            </Card>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cell: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.outlineVariant + '44',
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
