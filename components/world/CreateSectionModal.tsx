import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { createSection } from '@vaultstone/api';
import { getTemplate } from '@vaultstone/content';
import { selectSectionsForWorld, useSectionsStore } from '@vaultstone/store';
import type { TemplateKey, WorldSection } from '@vaultstone/types';
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

import { SectionTemplatePicker } from './SectionTemplatePicker';

type Props = {
  worldId: string;
  onClose: () => void;
};

export function CreateSectionModal({ worldId, onClose }: Props) {
  const [step, setStep] = useState<'template' | 'name'>('template');
  const [templateKey, setTemplateKey] = useState<TemplateKey>('locations');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const addSection = useSectionsStore((s) => s.addSection);
  const nextSortOrder = useSectionsStore(
    (s) => (selectSectionsForWorld(s, worldId).at(-1)?.sort_order ?? -1) + 1,
  );

  const template = useMemo(() => getTemplate(templateKey), [templateKey]);

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Section name is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    const { data, error: err } = await createSection({
      worldId,
      name,
      templateKey,
      sectionView: template.defaultSectionView,
      sortOrder: nextSortOrder,
    });
    setSubmitting(false);
    if (err || !data) {
      setError(err?.message ?? 'Failed to create section.');
      return;
    }
    addSection(data as WorldSection);
    onClose();
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
                    {step === 'template' ? 'Step 1 of 2' : 'Step 2 of 2'}
                  </MetaLabel>
                  <Text
                    variant="headline-sm"
                    family="serif-display"
                    weight="bold"
                    style={{ marginTop: 4 }}
                  >
                    {step === 'template' ? 'Pick a template' : `Name the ${template.label}`}
                  </Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Icon name="close" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>

              {step === 'template' ? (
                <View style={{ marginTop: spacing.lg }}>
                  <SectionTemplatePicker value={templateKey} onChange={setTemplateKey} />
                </View>
              ) : (
                <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                  <Input
                    label="Section name"
                    placeholder={template.label}
                    value={name}
                    onChangeText={setName}
                    autoFocus
                  />
                  <Text variant="body-sm" tone="secondary" style={{ color: colors.onSurfaceVariant }}>
                    Default view: <Text variant="body-sm" weight="semibold">{template.defaultSectionView}</Text>.
                    You can change it later from the section menu.
                  </Text>
                </View>
              )}

              {error ? (
                <Text variant="body-sm" style={{ color: colors.hpDanger, marginTop: spacing.md }}>
                  {error}
                </Text>
              ) : null}

              <View style={styles.footer}>
                {step === 'template' ? (
                  <>
                    <GhostButton label="Cancel" onPress={onClose} />
                    <GradientButton
                      label="Next"
                      onPress={() => {
                        setName(template.label);
                        setStep('name');
                      }}
                    />
                  </>
                ) : (
                  <>
                    <GhostButton label="Back" onPress={() => setStep('template')} />
                    <GradientButton
                      label="Create section"
                      onPress={handleSubmit}
                      loading={submitting}
                    />
                  </>
                )}
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
    maxWidth: 720,
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
  },
  closeBtn: {
    padding: spacing.xs,
    borderRadius: radius.full,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.xl,
  },
});
