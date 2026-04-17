import { Input } from '@vaultstone/ui';
import type { StructuredField } from '@vaultstone/types';

type Props = {
  field: StructuredField;
  value: unknown;
  onChange: (value: string) => void;
};

export function TextField({ field, value, onChange }: Props) {
  const stringValue = typeof value === 'string' ? value : '';
  return (
    <Input
      label={field.label}
      placeholder={field.placeholder}
      value={stringValue}
      onChangeText={onChange}
    />
  );
}
