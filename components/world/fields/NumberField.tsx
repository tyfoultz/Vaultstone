import { Input } from '@vaultstone/ui';
import type { StructuredField } from '@vaultstone/types';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: number | null) => void;
};

export function NumberField({ field, value, onChange }: Props) {
  const displayed =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  return (
    <Input
      label={field.label}
      placeholder={field.placeholder}
      value={displayed}
      onChangeText={(raw) => {
        if (raw.trim() === '') {
          onChange(null);
          return;
        }
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      keyboardType="numeric"
    />
  );
}
