import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SectionTemplate, WorldSection } from '@vaultstone/types';
import { Card, Icon, Text, colors, radius, spacing } from '@vaultstone/ui';

import { ACCENT_SWATCH, toMaterialIcon } from './helpers';

type Props = {
  section: WorldSection;
  template: SectionTemplate;
  pageCount: number;
  onPress: () => void;
  onMenuPress?: () => void;
  isOwner?: boolean;
  onDescriptionSave?: (description: string) => void;
};

export function WorldSectionCard({
  section, template, pageCount, onPress, onMenuPress, isOwner, onDescriptionSave,
}: Props) {
  const swatch = ACCENT_SWATCH[template.accentToken];
  const iconName = toMaterialIcon(section.custom_icon ?? template.icon);
  const isHidden = section.force_hidden_from_players;
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(section.description ?? '');

  function handleDescBlur() {
    setEditingDesc(false);
    const trimmed = descDraft.trim();
    if (trimmed !== (section.description ?? '')) {
      onDescriptionSave?.(trimmed);
    }
  }

  return (
    <Pressable onPress={onPress}>
      <Card tier="container" padding="lg" style={styles.root}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <LinearGradient
              colors={[swatch.container, swatch.glow]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.tile, { borderColor: swatch.border }]}
            >
              <Icon
                name={iconName as React.ComponentProps<typeof Icon>['name']}
                size={20}
                color={swatch.fg}
              />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text variant="title-md" family="serif-display" weight="bold">
                {section.name}
              </Text>
              <View style={[styles.visibilityBadge, isHidden ? styles.badgeGm : styles.badgePlayer]}>
                <Icon
                  name={isHidden ? 'visibility-off' : 'visibility'}
                  size={11}
                  color={isHidden ? colors.hpWarning : colors.hpHealthy}
                />
                <Text
                  variant="label-sm"
                  weight="semibold"
                  uppercase
                  style={{ color: isHidden ? colors.hpWarning : colors.hpHealthy, letterSpacing: 0.6, fontSize: 10 }}
                >
                  {isHidden ? 'GM Only' : 'Player-Visible'}
                </Text>
              </View>
            </View>
          </View>
          {onMenuPress ? (
            <Pressable onPress={(e) => { e.stopPropagation(); onMenuPress(); }} hitSlop={8}>
              <Icon name="more-horiz" size={18} color={colors.onSurfaceVariant} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.descriptionArea}>
          {editingDesc ? (
            <TextInput
              style={styles.descInput}
              value={descDraft}
              onChangeText={setDescDraft}
              onBlur={handleDescBlur}
              placeholder="Add a short description…"
              placeholderTextColor={colors.outline}
              multiline
              maxLength={200}
              autoFocus
            />
          ) : section.description ? (
            <Pressable
              onPress={isOwner ? (e) => { e.stopPropagation(); setEditingDesc(true); setDescDraft(section.description ?? ''); } : undefined}
            >
              <Text
                variant="body-sm"
                style={{ color: colors.onSurfaceVariant, lineHeight: 20 }}
                numberOfLines={4}
              >
                {section.description}
              </Text>
            </Pressable>
          ) : isOwner ? (
            <Pressable onPress={(e) => { e.stopPropagation(); setEditingDesc(true); setDescDraft(''); }}>
              <Text
                variant="body-sm"
                style={{ color: colors.outline, fontStyle: 'italic' }}
              >
                Add a short description…
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.footer}>
          <Text variant="label-sm" weight="semibold" style={{ color: swatch.fg }}>
            OPEN →
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

type AddCardProps = {
  onPress: () => void;
  subtitle?: string;
};

export function WorldSectionAddCard({ onPress, subtitle }: AddCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.addRoot}>
      <Icon name="add-circle-outline" size={28} color={colors.outline} />
      <Text variant="label-md" weight="semibold" tone="secondary" style={{ marginTop: spacing.xs }}>
        New Section
      </Text>
      {subtitle ? (
        <Text variant="body-sm" style={{ color: colors.outline, marginTop: 2 }}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    minHeight: 220,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    flex: 1,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  badgePlayer: {
    backgroundColor: colors.hpHealthy + '18',
  },
  badgeGm: {
    backgroundColor: colors.hpWarning + '18',
  },
  descriptionArea: {
    flex: 1,
    minHeight: 40,
  },
  descInput: {
    color: colors.onSurfaceVariant,
    fontSize: 13,
    lineHeight: 20,
    padding: 0,
    margin: 0,
    minHeight: 40,
    textAlignVertical: 'top',
  } as object,
  footer: {
    marginTop: 'auto',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  addRoot: {
    minHeight: 220,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surfaceContainerLowest,
  },
});
