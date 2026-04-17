import { Input } from '@vaultstone/ui';
import type { StructuredField } from '@vaultstone/types';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string) => void;
};

// Freeform because the world may have a custom calendar (Phase 6).
// Accepts anything the DM types — "2nd Thaw, 1142 AC", "Era of Mists", etc.
export function DateFreeformField({ field, value, onChange }: Props) {
  const stringValue = typeof value === 'string' ? value : '';
  return (
    <Input
      label={field.label}
      placeholder={field.placeholder ?? 'Freeform date…'}
      value={stringValue}
      onChangeText={onChange}
    />
  );
}
