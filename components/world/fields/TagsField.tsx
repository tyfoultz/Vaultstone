import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StructuredField } from '@vaultstone/types';
import {
  Icon,
  Input,
  MetaLabel,
  Text,
  colors,
  radius,
  spacing,
} from '@vaultstone/ui';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string[]) => void;
};

export function TagsField({ field, value, onChange }: Props) {
  const tags = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState('');

  function commit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) onChange([...tags, trimmed]);
    setDraft('');
  }

  return (
    <View style={styles.root}>
      <MetaLabel size="sm">{field.label}</MetaLabel>
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text variant="label-md" style={{ color: colors.onSurfaceVariant }}>
              {tag}
            </Text>
            <Pressable
              onPress={() => onChange(tags.filter((t) => t !== tag))}
              style={styles.tagRemove}
              accessibilityLabel={`Remove ${tag}`}
            >
              <Icon name="close" size={12} color={colors.outline} />
            </Pressable>
          </View>
        ))}
      </View>
      <Input
        placeholder="Add a tag and press enter…"
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={commit}
        onBlur={commit}
        returnKeyType="done"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs + 2,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: spacing.sm,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant + '55',
  },
  tagRemove: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
